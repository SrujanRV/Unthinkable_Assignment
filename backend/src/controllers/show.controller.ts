import { Request, Response } from 'express';
import { prisma } from '../services/db.service';
import { redis } from '../services/redis.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const SEAT_HOLD_TTL_SECONDS = Number(process.env.SEAT_HOLD_TTL_SECONDS) || 600; // 10 minutes default

export const getShowDetails = async (req: Request, res: Response): Promise<void> => {
  const { showId } = req.params;

  try {
    const show = await prisma.show.findUnique({
      where: { id: showId },
      include: {
        event: {
          select: { id: true, title: true, description: true, type: true },
        },
        venue: {
          select: { id: true, name: true, location: true },
        },
        showPrices: {
          include: { category: { select: { id: true, name: true, priceMultiplier: true } } },
        },
      },
    });

    if (!show) {
      res.status(404).json({ error: { message: 'Showtime listing not found', status: 404 } });
      return;
    }

    res.status(200).json({ show });
  } catch (error) {
    console.error('Get show details error:', error);
    res.status(500).json({ error: { message: 'Internal server error fetching show details', status: 500 } });
  }
};

export const getShowSeatsMap = async (req: Request, res: Response): Promise<void> => {
  const { showId } = req.params;

  try {
    const showSeats = await prisma.showSeat.findMany({
      where: { showId },
      include: {
        seat: {
          select: {
            id: true,
            row: true,
            number: true,
            seatCategoryId: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: [{ seat: { row: 'asc' } }, { seat: { number: 'asc' } }],
    });

    if (showSeats.length === 0) {
      res.status(404).json({ error: { message: 'Seats not found for this showtime', status: 404 } });
      return;
    }

    const holdPattern = `show:${showId}:seat:*:hold`;
    const keys = await redis.keys(holdPattern);
    
    const activeHoldsMap: { [seatId: string]: { userId: string; ttl: number } } = {};
    
    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      keys.forEach((key) => {
        pipeline.get(key);
        pipeline.ttl(key);
      });
      const results = await pipeline.exec();

      if (results) {
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const seatId = key.split(':')[4];
          const getResult = results[i * 2];
          const ttlResult = results[i * 2 + 1];

          const userId = getResult[1] as string | null;
          const ttl = ttlResult[1] as number | null;

          if (userId && ttl && ttl > 0) {
            activeHoldsMap[seatId] = { userId, ttl };
          }
        }
      }
    }

    const mergedSeats = showSeats.map((ss) => {
      let currentStatus = ss.status;
      let heldByUserId = ss.heldByUserId;
      let heldUntil = ss.heldUntil;

      const redisHold = activeHoldsMap[ss.seatId];

      if (redisHold) {
        currentStatus = 'HELD';
        heldByUserId = redisHold.userId;
        const now = new Date();
        heldUntil = new Date(now.getTime() + redisHold.ttl * 1000);
      } else if (currentStatus === 'HELD') {
        currentStatus = 'AVAILABLE';
        heldByUserId = null;
        heldUntil = null;
      }

      return {
        id: ss.id,
        seatId: ss.seatId,
        row: ss.seat.row,
        number: ss.seat.number,
        categoryId: ss.seat.seatCategoryId,
        categoryName: ss.seat.category.name,
        status: currentStatus,
        heldByUserId,
        heldUntil: heldUntil ? heldUntil.toISOString() : null,
      };
    });

    res.status(200).json({ seats: mergedSeats });
  } catch (error) {
    console.error('Get seats map error:', error);
    res.status(500).json({ error: { message: 'Internal server error fetching seat map', status: 500 } });
  }
};

export const holdSeats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { showId } = req.params;
  const { seatIds } = req.body;

  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
    res.status(400).json({ error: { message: 'At least one seat ID is required to hold', status: 400 } });
    return;
  }

  const userId = req.user.id;
  const lockedKeys: string[] = [];

  try {
    // 1. Verify seat availabilities in PostgreSQL
    const currentSeats = await prisma.showSeat.findMany({
      where: {
        showId,
        seatId: { in: seatIds },
      },
    });

    if (currentSeats.length !== seatIds.length) {
      res.status(400).json({ error: { message: 'One or more requested seats do not exist for this showtime', status: 400 } });
      return;
    }

    // Check if any seat is already booked or currently held in DB (where heldUntil is still active and not owned by current user)
    const now = new Date();
    for (const ss of currentSeats) {
      if (ss.status === 'BOOKED') {
        res.status(400).json({ error: { message: `Seat is already booked`, status: 400 } });
        return;
      }
      if (ss.status === 'HELD' && ss.heldUntil && ss.heldUntil > now && ss.heldByUserId !== userId) {
        res.status(400).json({ error: { message: `Seat is already held by another user`, status: 400 } });
        return;
      }
    }

    // 2. Acquire locks in Redis atomically
    for (const seatId of seatIds) {
      const lockKey = `show:${showId}:seat:${seatId}:hold`;
      const acquired = await redis.set(lockKey, userId, 'EX', SEAT_HOLD_TTL_SECONDS, 'NX');
      
      if (acquired === 'OK') {
        lockedKeys.push(lockKey);
      } else {
        // Rollback already acquired locks to guarantee all-or-nothing atomicity for this batch!
        if (lockedKeys.length > 0) {
          await redis.del(...lockedKeys);
        }
        res.status(400).json({
          error: { message: 'One or more seats are already held by another user. Please choose another seat.', status: 400 },
        });
        return;
      }
    }

    // 3. Update PostgreSQL durable statuses
    const holdExpiry = new Date(Date.now() + SEAT_HOLD_TTL_SECONDS * 1000);
    await prisma.showSeat.updateMany({
      where: {
        showId,
        seatId: { in: seatIds },
      },
      data: {
        status: 'HELD',
        heldByUserId: userId,
        heldUntil: holdExpiry,
      },
    });

    // 4. Broadcast live update to other clients in this show room via Socket.io
    const io = req.app.get('io');
    if (io) {
      seatIds.forEach((seatId) => {
        io.to(`show:${showId}`).emit('seatStatusUpdate', {
          seatId,
          status: 'HELD',
          heldByUserId: userId,
          heldUntil: holdExpiry.toISOString(),
        });
      });
    }

    res.status(200).json({
      message: 'Seats held successfully',
      heldUntil: holdExpiry.toISOString(),
    });
  } catch (error) {
    console.error('[ShowSeat] Hold seats error:', error);
    // Cleanup Redis locks on exception
    if (lockedKeys.length > 0) {
      await redis.del(...lockedKeys);
    }
    res.status(500).json({ error: { message: 'Internal server error processing holds', status: 500 } });
  }
};

export const releaseSeats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { showId } = req.params;
  const { seatIds } = req.body;

  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
    res.status(400).json({ error: { message: 'Seat IDs are required to release', status: 400 } });
    return;
  }

  const userId = req.user.id;

  try {
    // 1. Verify holds in Redis and delete them if owned by current user
    const keysToDelete: string[] = [];
    const seatsToRelease: string[] = [];

    for (const seatId of seatIds) {
      const lockKey = `show:${showId}:seat:${seatId}:hold`;
      const currentHolder = await redis.get(lockKey);

      if (currentHolder === userId) {
        keysToDelete.push(lockKey);
        seatsToRelease.push(seatId);
      }
    }

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }

    // 2. Update PostgreSQL durable statuses (only where held by current user)
    if (seatsToRelease.length > 0) {
      await prisma.showSeat.updateMany({
        where: {
          showId,
          seatId: { in: seatsToRelease },
          heldByUserId: userId,
          status: 'HELD',
        },
        data: {
          status: 'AVAILABLE',
          heldByUserId: null,
          heldUntil: null,
        },
      });

      // 3. Broadcast release updates via Socket.io
      const io = req.app.get('io');
      if (io) {
        seatsToRelease.forEach((seatId) => {
          io.to(`show:${showId}`).emit('seatStatusUpdate', {
            seatId,
            status: 'AVAILABLE',
            heldByUserId: null,
            heldUntil: null,
          });
        });
      }
    }

    res.status(200).json({ message: 'Seats released successfully' });
  } catch (error) {
    console.error('[ShowSeat] Release seats error:', error);
    res.status(500).json({ error: { message: 'Internal server error releasing holds', status: 500 } });
  }
};
