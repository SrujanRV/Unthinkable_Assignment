import { Server } from 'socket.io';
import { prisma } from './db.service';
import { redis } from './redis.service';
import { sendTicketEmail } from './email.service';
import { generateClaimToken } from '../controllers/waitlist.controller';

const SWEEP_INTERVAL_MS = 10000; // Sweep every 10 seconds
const OFFER_TTL_SECONDS = Number(process.env.OFFER_TTL_SECONDS) || 300; // 5 minutes default

export const startHoldSweep = (io: Server): void => {
  console.log(`[Sweep] Expired hold sweeper service initialized (interval: ${SWEEP_INTERVAL_MS / 1000}s)`);

  setInterval(async () => {
    try {
      const now = new Date();

      // ==========================================
      // SECTION 1: Sweep Expired Waitlist Offers
      // ==========================================
      const expiredOffers = await prisma.waitlistEntry.findMany({
        where: {
          status: 'OFFERED',
          offerExpiresAt: { lt: now },
        },
      });

      for (const entry of expiredOffers) {
        console.log(`[Sweep] Expired waitlist offer detected for entry ${entry.id} user ${entry.userId}`);

        await prisma.$transaction(async (tx) => {
          // 1. Mark current offer as EXPIRED
          await tx.waitlistEntry.update({
            where: { id: entry.id },
            data: { status: 'EXPIRED' },
          });

          // 2. Locate the showSeat currently held for this expired user
          const showSeat = await tx.showSeat.findFirst({
            where: {
              showId: entry.showId,
              status: 'HELD',
              heldByUserId: entry.userId,
              seat: {
                seatCategoryId: entry.seatCategoryId,
              },
            },
            include: {
              seat: { include: { category: true } },
              show: {
                include: {
                  event: true,
                  showPrices: true,
                },
              },
            },
          });

          if (showSeat) {
            // 3. Find if there is another waiting candidate
            const nextInQueue = await tx.waitlistEntry.findFirst({
              where: {
                showId: entry.showId,
                seatCategoryId: entry.seatCategoryId,
                status: 'WAITING',
              },
              orderBy: { position: 'asc' },
              include: { user: true },
            });

            if (nextInQueue) {
              const offerExpiry = new Date(Date.now() + OFFER_TTL_SECONDS * 1000);

              // Update next candidate to OFFERED
              await tx.waitlistEntry.update({
                where: { id: nextInQueue.id },
                data: {
                  status: 'OFFERED',
                  offerExpiresAt: offerExpiry,
                },
              });

              // Transfer PostgreSQL held seat to next candidate
              await tx.showSeat.update({
                where: { id: showSeat.id },
                data: {
                  heldByUserId: nextInQueue.userId,
                  heldUntil: offerExpiry,
                },
              });

              // Set Redis lock key for next candidate
              const lockKey = `show:${entry.showId}:seat:${showSeat.seatId}:hold`;
              await redis.set(lockKey, nextInQueue.userId, 'EX', OFFER_TTL_SECONDS);

              // Generate waitlist claim link
              const token = generateClaimToken(nextInQueue.userId, entry.showId, showSeat.seatId, nextInQueue.id);
              const claimUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?claimToken=${token}`;

              // Send email notification with QR code pointing to claim URL
              const showPriceObj = showSeat.show.showPrices.find((sp) => sp.seatCategoryId === entry.seatCategoryId);
              const seatPrice = showPriceObj ? Number(showPriceObj.price) : 0;

              await sendTicketEmail({
                to: nextInQueue.user.email,
                bookingReference: `WL-OFFER-${nextInQueue.id.slice(0, 8)}`,
                eventTitle: showSeat.show.event.title,
                venueName: showSeat.seat.category.name,
                venueLocation: `Waitlist Offer: Claim inside ${OFFER_TTL_SECONDS / 60} minutes`,
                startTime: showSeat.show.startTime.toISOString(),
                seats: [`${showSeat.seat.row}${showSeat.seat.number}`],
                totalPrice: seatPrice,
                qrCodeDataUrl: await require('qrcode').toDataURL(claimUrl),
              });

              // Broadcast live seat status update
              io.to(`show:${entry.showId}`).emit('seatStatusUpdate', {
                seatId: showSeat.seatId,
                status: 'HELD',
                heldByUserId: nextInQueue.userId,
                heldUntil: offerExpiry.toISOString(),
              });
            } else {
              // No more waitlist candidates: release the seat to AVAILABLE
              await tx.showSeat.update({
                where: { id: showSeat.id },
                data: {
                  status: 'AVAILABLE',
                  heldByUserId: null,
                  heldUntil: null,
                },
              });

              // Delete Redis hold key
              const lockKey = `show:${entry.showId}:seat:${showSeat.seatId}:hold`;
              await redis.del(lockKey);

              // Broadcast release to Socket.io
              io.to(`show:${entry.showId}`).emit('seatStatusUpdate', {
                seatId: showSeat.seatId,
                status: 'AVAILABLE',
                heldByUserId: null,
                heldUntil: null,
              });
            }
          }
        });
      }

      // ==========================================
      // SECTION 2: Sweep Expired Standard Holds
      // ==========================================
      const expiredSeats = await prisma.showSeat.findMany({
        where: {
          status: 'HELD',
          heldUntil: { lt: now },
        },
        include: {
          seat: {
            include: {
              category: true,
            },
          },
          show: {
            include: {
              event: true,
              showPrices: true,
            },
          },
        },
      });

      for (const ss of expiredSeats) {
        const lockKey = `show:${ss.showId}:seat:${ss.seatId}:hold`;
        const activeHolder = await redis.get(lockKey);

        // If Redis key has expired (returns null) OR the holder has changed, we release the hold in DB
        if (!activeHolder) {
          console.log(`[Sweep] Seat hold expired on seat ${ss.seatId} for show ${ss.showId}`);

          // Check if there is a waitlist for this seat category
          const nextInQueue = await prisma.waitlistEntry.findFirst({
            where: {
              showId: ss.showId,
              seatCategoryId: ss.seat.seatCategoryId,
              status: 'WAITING',
            },
            orderBy: { position: 'asc' },
            include: { user: true },
          });

          if (nextInQueue) {
            const offerExpiry = new Date(Date.now() + OFFER_TTL_SECONDS * 1000);

            await prisma.$transaction(async (tx) => {
              // Mark waitlist position as OFFERED
              await tx.waitlistEntry.update({
                where: { id: nextInQueue.id },
                data: {
                  status: 'OFFERED',
                  offerExpiresAt: offerExpiry,
                },
              });

              // Transfer PostgreSQL held seat to next candidate
              await tx.showSeat.update({
                where: { id: ss.id },
                data: {
                  status: 'HELD',
                  heldByUserId: nextInQueue.userId,
                  heldUntil: offerExpiry,
                },
              });

              // Set Redis hold key for new candidate
              await redis.set(lockKey, nextInQueue.userId, 'EX', OFFER_TTL_SECONDS);

              // Generate waitlist claim link
              const token = generateClaimToken(nextInQueue.userId, ss.showId, ss.seatId, nextInQueue.id);
              const claimUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?claimToken=${token}`;

              // Send email notification with QR code pointing to claim URL
              const showPriceObj = ss.show.showPrices.find((sp) => sp.seatCategoryId === ss.seat.seatCategoryId);
              const seatPrice = showPriceObj ? Number(showPriceObj.price) : 0;

              await sendTicketEmail({
                to: nextInQueue.user.email,
                bookingReference: `WL-OFFER-${nextInQueue.id.slice(0, 8)}`,
                eventTitle: ss.show.event.title,
                venueName: ss.seat.category?.name || 'Standard',
                venueLocation: `Waitlist Offer: Claim inside ${OFFER_TTL_SECONDS / 60} minutes`,
                startTime: ss.show.startTime.toISOString(),
                seats: [`${ss.seat.row}${ss.seat.number}`],
                totalPrice: seatPrice,
                qrCodeDataUrl: await require('qrcode').toDataURL(claimUrl),
              });

              // Broadcast live seat status update (still HELD, but new holder)
              io.to(`show:${ss.showId}`).emit('seatStatusUpdate', {
                seatId: ss.seatId,
                status: 'HELD',
                heldByUserId: nextInQueue.userId,
                heldUntil: offerExpiry.toISOString(),
              });
            });
          } else {
            // No waitlist queue: release seat to AVAILABLE
            await prisma.showSeat.update({
              where: { id: ss.id },
              data: {
                status: 'AVAILABLE',
                heldByUserId: null,
                heldUntil: null,
              },
            });

            // Broadcast AVAILABLE update to active socket room clients
            io.to(`show:${ss.showId}`).emit('seatStatusUpdate', {
              seatId: ss.seatId,
              status: 'AVAILABLE',
              heldByUserId: null,
              heldUntil: null,
            });
          }
        }
      }
    } catch (error) {
      console.error('[Sweep] Error during expired hold sweeping:', error);
    }
  }, SWEEP_INTERVAL_MS);
};
