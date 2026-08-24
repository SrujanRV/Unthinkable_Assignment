import { Request, Response } from 'express';
import { prisma } from '../services/db.service';
import { redis } from '../services/redis.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { sendTicketEmail } from '../services/email.service';

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

    // Check if any seat is already booked or held by someone else — collect ALL conflicts first
    const now = new Date();
    const preflightConflicts: string[] = [];
    for (const ss of currentSeats) {
      if (ss.status === 'BOOKED') {
        preflightConflicts.push(ss.seatId);
      } else if (ss.status === 'HELD' && ss.heldUntil && ss.heldUntil > now && ss.heldByUserId !== userId) {
        preflightConflicts.push(ss.seatId);
      }
    }

    if (preflightConflicts.length > 0) {
      res.status(409).json({
        error: {
          message: `${preflightConflicts.length} seat(s) in your selection are already taken. Please reselect.`,
          conflictingSeatIds: preflightConflicts,
          status: 409,
        },
      });
      return;
    }


    // 2. Acquire locks in Redis atomically — all-or-nothing across the batch
    const conflictingSeatIds: string[] = [];
    for (const seatId of seatIds) {
      const lockKey = `show:${showId}:seat:${seatId}:hold`;
      const acquired = await redis.set(lockKey, userId, 'EX', SEAT_HOLD_TTL_SECONDS, 'NX');

      if (acquired === 'OK') {
        lockedKeys.push(lockKey);
      } else {
        conflictingSeatIds.push(seatId);
      }
    }

    if (conflictingSeatIds.length > 0) {
      // Roll back every lock acquired so far — leave nothing held
      if (lockedKeys.length > 0) {
        await redis.del(...lockedKeys);
      }
      res.status(409).json({
        error: {
          message: `${conflictingSeatIds.length} seat(s) in your selection were just taken by another user. Please reselect.`,
          conflictingSeatIds,
          status: 409,
        },
      });
      return;
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
      console.log(`[Socket.io Broadcast] Emitting seatStatusChanged for show:${showId}, seats:`, seatIds);
      seatIds.forEach((seatId) => {
        io.to(`show:${showId}`).emit('seatStatusChanged', {
          seatId,
          status: 'HELD',
          heldByUserId: userId,
          heldUntil: holdExpiry.toISOString(),
        });
      });
    } else {
      console.error('[Socket.io Error] io instance NOT found on req.app');
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
          io.to(`show:${showId}`).emit('seatStatusChanged', {
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

export const checkoutSeats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { showId } = req.params;
  const { seatIds } = req.body;

  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
    res.status(400).json({ error: { message: 'Seat IDs are required to checkout', status: 400 } });
    return;
  }

  const userId = req.user.id;

  try {
    // 1. Verify holds in Redis first (to prevent races if expired mid-checkout)
    for (const seatId of seatIds) {
      const lockKey = `show:${showId}:seat:${seatId}:hold`;
      const currentHolder = await redis.get(lockKey);

      if (currentHolder !== userId) {
        res.status(400).json({
          error: {
            message: `Seat hold has expired or is invalid. Please select your seats and try again.`,
            status: 400,
          },
        });
        return;
      }
    }

    // 2. Fetch full show & venue details for email confirmation
    const show = await prisma.show.findUnique({
      where: { id: showId },
      include: {
        event: true,
        venue: true,
        showPrices: {
          include: { category: true },
        },
      },
    });

    if (!show) {
      res.status(404).json({ error: { message: 'Showtime listing not found', status: 404 } });
      return;
    }

    // Map prices
    const priceMap: { [catId: string]: number } = {};
    show.showPrices.forEach((sp) => {
      priceMap[sp.seatCategoryId] = Number(sp.price);
    });

    // 3. Fetch show seats with physical labels
    const showSeats = await prisma.showSeat.findMany({
      where: {
        showId,
        seatId: { in: seatIds },
      },
      include: {
        seat: true,
      },
    });

    if (showSeats.length !== seatIds.length) {
      res.status(400).json({ error: { message: 'One or more seats do not exist for this showtime', status: 400 } });
      return;
    }

    // Double check PostgreSQL status is still HELD by this user (fail-safe)
    const now = new Date();
    for (const ss of showSeats) {
      if (ss.status !== 'HELD' || ss.heldByUserId !== userId || (ss.heldUntil && ss.heldUntil < now)) {
        res.status(400).json({
          error: {
            message: `Seat hold on ${ss.seat.row}${ss.seat.number} has expired. Please hold the seats again.`,
            status: 400,
          },
        });
        return;
      }
    }

    // Calculate total price
    let totalPrice = 0;
    showSeats.forEach((ss) => {
      totalPrice += priceMap[ss.seat.seatCategoryId] || 0;
    });

    // 4. Generate unique booking reference
    const bookingReference = 'BK-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // 5. Execute transactional creation and update in PostgreSQL
    const booking = await prisma.$transaction(async (tx) => {
      // Create Booking
      const b = await tx.booking.create({
        data: {
          bookingReference,
          userId,
          showId,
          status: 'CONFIRMED',
          totalAmount: totalPrice,
        },
      });

      // Update seat statuses to BOOKED
      await tx.showSeat.updateMany({
        where: {
          showId,
          seatId: { in: seatIds },
        },
        data: {
          status: 'BOOKED',
          bookingId: b.id,
          heldByUserId: null,
          heldUntil: null,
        },
      });

      // Mark matching waitlist entries as CONFIRMED if user was waitlisted
      const categoryIds = showSeats.map((ss) => ss.seat.seatCategoryId);
      await tx.waitlistEntry.updateMany({
        where: {
          showId,
          userId,
          seatCategoryId: { in: categoryIds },
          status: 'OFFERED',
        },
        data: {
          status: 'CONFIRMED',
        },
      });

      return b;
    });

    // 6. Delete Redis keys (holds are finalized)
    const redisKeys = seatIds.map((id) => `show:${showId}:seat:${id}:hold`);
    await redis.del(...redisKeys);

    // 7. Broadcast seat bookings via Socket.io
    const io = req.app.get('io');
    if (io) {
      seatIds.forEach((seatId) => {
        io.to(`show:${showId}`).emit('seatStatusChanged', {
          seatId,
          status: 'BOOKED',
          heldByUserId: null,
          heldUntil: null,
        });
      });
    }

    // 8. Generate QR Code containing bookingReference
    const qrCodeDataUrl = await QRCode.toDataURL(bookingReference);

    // 9. Dispatch confirmation email with attached QR Ticket
    const seatLabels = showSeats.map((ss) => `${ss.seat.row}${ss.seat.number}`);
    const emailPreviewUrl = await sendTicketEmail({
      to: req.user.email,
      bookingReference,
      eventTitle: show.event.title,
      venueName: show.venue.name,
      venueLocation: show.venue.location,
      startTime: show.startTime.toISOString(),
      seats: seatLabels,
      totalPrice,
      qrCodeDataUrl,
    });

    res.status(200).json({
      message: 'Booking completed successfully!',
      booking: {
        id: booking.id,
        bookingReference,
        totalPrice,
        seats: seatLabels,
        emailPreviewUrl,
        qrCodeDataUrl,
      },
    });
  } catch (error) {
    console.error('[Booking] Checkout error:', error);
    res.status(500).json({ error: { message: 'Internal server error processing checkout', status: 500 } });
  }
};
