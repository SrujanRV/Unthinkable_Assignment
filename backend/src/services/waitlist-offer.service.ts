import { prisma } from './db.service';
import { redis } from './redis.service';

const OFFER_TTL_SECONDS = Number(process.env.OFFER_TTL_SECONDS) || 300;

export const offerSeatToWaitlistOrRelease = async (
  tx: any,
  showId: string,
  seatId: string,
  seatCategoryId: string,
  showSeatId: string,
  io: any
): Promise<boolean> => {
  const nextInQueue = await tx.waitlistEntry.findFirst({
    where: {
      showId,
      seatCategoryId,
      status: 'WAITING',
    },
    orderBy: { position: 'asc' },
    include: { user: true },
  });

  if (nextInQueue) {
    const offerExpiry = new Date(Date.now() + OFFER_TTL_SECONDS * 1000);

    await tx.waitlistEntry.update({
      where: { id: nextInQueue.id },
      data: {
        status: 'OFFERED',
        offerExpiresAt: offerExpiry,
      },
    });

    await tx.showSeat.update({
      where: { id: showSeatId },
      data: {
        status: 'HELD',
        heldByUserId: nextInQueue.userId,
        heldUntil: offerExpiry,
        bookingId: null,
      },
    });

    const lockKey = `show:${showId}:seat:${seatId}:hold`;
    await redis.set(lockKey, nextInQueue.userId, 'EX', OFFER_TTL_SECONDS);

    if (io) {
      io.to(`show:${showId}`).emit('seatStatusChanged', {
        seatId,
        status: 'HELD',
        heldByUserId: nextInQueue.userId,
        heldUntil: offerExpiry.toISOString(),
      });
      io.emit('waitlistOfferIssued', { userId: nextInQueue.userId, showId });
    }
    return true;
  } else {
    await tx.showSeat.update({
      where: { id: showSeatId },
      data: {
        status: 'AVAILABLE',
        heldByUserId: null,
        heldUntil: null,
        bookingId: null,
      },
    });

    if (io) {
      io.to(`show:${showId}`).emit('seatStatusChanged', {
        seatId,
        status: 'AVAILABLE',
        heldByUserId: null,
        heldUntil: null,
      });
    }
    return false;
  }
};
