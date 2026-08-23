import { Request, Response } from 'express';
import { prisma } from '../services/db.service';
import { redis } from '../services/redis.service';

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
    // 1. Fetch all show seats from PostgreSQL
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

    // 2. Fetch all active holds for this show from Redis
    // Redis key format: show:{showId}:seat:{seatId}:hold -> value: userId
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

    // 3. Merge PostgreSQL seat status with Redis live holds (Fast-path cache TTL overrides DB)
    const mergedSeats = showSeats.map((ss) => {
      let currentStatus = ss.status;
      let heldByUserId = ss.heldByUserId;
      let heldUntil = ss.heldUntil;

      const redisHold = activeHoldsMap[ss.seatId];

      if (redisHold) {
        // If there is an active hold in Redis, override DB status to HELD
        currentStatus = 'HELD';
        heldByUserId = redisHold.userId;
        const now = new Date();
        heldUntil = new Date(now.getTime() + redisHold.ttl * 1000);
      } else if (currentStatus === 'HELD') {
        // If DB status says HELD but Redis hold has expired/disappeared, treat as AVAILABLE
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
