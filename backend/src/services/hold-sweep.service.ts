import { Server } from 'socket.io';
import { prisma } from './db.service';
import { redis } from './redis.service';

const SWEEP_INTERVAL_MS = 10000; // Sweep every 10 seconds

export const startHoldSweep = (io: Server): void => {
  console.log(`[Sweep] Expired hold sweeper service initialized (interval: ${SWEEP_INTERVAL_MS / 1000}s)`);

  setInterval(async () => {
    try {
      const now = new Date();

      // 1. Query database for seats with expired holds
      const expiredSeats = await prisma.showSeat.findMany({
        where: {
          status: 'HELD',
          heldUntil: { lt: now },
        },
        select: {
          id: true,
          showId: true,
          seatId: true,
          heldByUserId: true,
        },
      });

      if (expiredSeats.length === 0) return;

      console.log(`[Sweep] Found ${expiredSeats.length} potentially expired seat holds in database.`);

      for (const ss of expiredSeats) {
        const lockKey = `show:${ss.showId}:seat:${ss.seatId}:hold`;
        const activeHolder = await redis.get(lockKey);

        // If Redis key has expired (returns null) OR the holder has changed, we release the old DB hold
        if (!activeHolder) {
          console.log(`[Sweep] Releasing expired hold on seat ${ss.seatId} for show ${ss.showId}`);

          // Update PostgreSQL
          await prisma.showSeat.update({
            where: { id: ss.id },
            data: {
              status: 'AVAILABLE',
              heldByUserId: null,
              heldUntil: null,
            },
          });

          // Broadcast status change via Socket.io
          io.to(`show:${ss.showId}`).emit('seatStatusUpdate', {
            seatId: ss.seatId,
            status: 'AVAILABLE',
            heldByUserId: null,
            heldUntil: null,
          });
        }
      }
    } catch (error) {
      console.error('[Sweep] Error during expired hold sweeping:', error);
    }
  }, SWEEP_INTERVAL_MS);
};
