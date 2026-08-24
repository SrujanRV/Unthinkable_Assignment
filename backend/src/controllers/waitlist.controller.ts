import { Response } from 'express';
import { prisma } from '../services/db.service';
import { redis } from '../services/redis.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendTicketEmail } from '../services/email.service';
import { offerSeatToWaitlistOrRelease } from '../services/waitlist-offer.service';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import QRCode from 'qrcode';

const OFFER_TTL_SECONDS = Number(process.env.OFFER_TTL_SECONDS) || 300; // 5 minutes default
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// Helper to generate signed claim token
export const generateClaimToken = (userId: string, showId: string, seatId: string, waitlistEntryId: string): string => {
  return jwt.sign({ userId, showId, seatId, waitlistEntryId }, JWT_SECRET, {
    expiresIn: `${OFFER_TTL_SECONDS}s`,
  });
};

export const joinWaitlist = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { showId } = req.params;
  const { seatCategoryId } = req.body;

  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  if (!seatCategoryId) {
    res.status(400).json({ error: { message: 'Seat Category ID is required', status: 400 } });
    return;
  }

  const userId = req.user.id;

  try {
    // 1. Check if category is actually sold out for the show
    const seatsInCategory = await prisma.showSeat.findMany({
      where: {
        showId,
        seat: { seatCategoryId },
      },
    });

    if (seatsInCategory.length === 0) {
      res.status(404).json({ error: { message: 'No seats found in this category for the showtime', status: 404 } });
      return;
    }

    const availableOrSelfHeld = seatsInCategory.filter(
      (ss) => ss.status === 'AVAILABLE' || (ss.status === 'HELD' && ss.heldByUserId === userId)
    );

    if (availableOrSelfHeld.length > 0) {
      res.status(400).json({
        error: { message: 'Seats are still available in this category; please hold or book them directly', status: 400 },
      });
      return;
    }

    // 2. Check if user is already on the waitlist for this category
    const existingEntry = await prisma.waitlistEntry.findFirst({
      where: {
        showId,
        seatCategoryId,
        userId,
        status: { in: ['WAITING', 'OFFERED'] },
      },
    });

    if (existingEntry) {
      res.status(400).json({ error: { message: 'You are already on the active waitlist for this category', status: 400 } });
      return;
    }

    // 3. Create waitlist entry with sequential position queue
    const activeEntriesCount = await prisma.waitlistEntry.count({
      where: {
        showId,
        seatCategoryId,
        status: { in: ['WAITING', 'OFFERED'] },
      },
    });

    const entry = await prisma.waitlistEntry.create({
      data: {
        userId,
        showId,
        seatCategoryId,
        position: activeEntriesCount + 1,
        status: 'WAITING',
      },
      include: {
        category: { select: { name: true } },
      },
    });

    res.status(200).json({
      message: 'Successfully joined the waitlist',
      waitlistEntry: {
        id: entry.id,
        position: entry.position,
        categoryName: entry.category.name,
      },
    });
  } catch (error) {
    console.error('[Waitlist] Join waitlist error:', error);
    res.status(500).json({ error: { message: 'Internal server error joining waitlist', status: 500 } });
  }
};

export const cancelBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { bookingId } = req.params;

  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  const userId = req.user.id;

  try {
    // 1. Fetch booking details and verify owner
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        showSeats: {
          include: {
            seat: { include: { category: true } },
          },
        },
        show: {
          include: { event: true },
        },
      },
    });

    if (!booking) {
      res.status(404).json({ error: { message: 'Booking not found', status: 404 } });
      return;
    }

    // Verify ownership or check if Admin/Organiser
    if (booking.userId !== userId && req.user.role !== 'ADMIN') {
      res.status(403).json({ error: { message: 'Forbidden: Access denied to cancel booking', status: 403 } });
      return;
    }

    if (booking.status === 'CANCELLED') {
      res.status(400).json({ error: { message: 'Booking is already cancelled', status: 400 } });
      return;
    }

    // 2. Perform cancellation and waitlist cascading
    await prisma.$transaction(async (tx) => {
      // Mark booking status as CANCELLED
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });

      // Release seats and offer to waitlisted users if queue exists
      const io = req.app.get('io');
      for (const showSeat of booking.showSeats) {
        const catId = showSeat.seat.seatCategoryId;
        await offerSeatToWaitlistOrRelease(tx, booking.showId, showSeat.seatId, catId, showSeat.id, io);
      }
    });

    res.status(200).json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('[Booking] Cancel error:', error);
    res.status(500).json({ error: { message: 'Internal server error cancelling booking', status: 500 } });
  }
};

export const listMyBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  const userId = req.user.id;

  try {
    const bookings = await prisma.booking.findMany({
      where: { userId },
      include: {
        show: {
          include: {
            event: { select: { title: true, type: true } },
            venue: { select: { name: true, location: true } },
          },
        },
        showSeats: {
          include: {
            seat: { select: { row: true, number: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ bookings });
  } catch (error) {
    console.error('[Booking] List error:', error);
    res.status(500).json({ error: { message: 'Internal server error listing bookings', status: 500 } });
  }
};

export const getMyActiveWaitlistOffers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  const userId = req.user.id;
  const now = new Date();

  try {
    const activeEntries = await prisma.waitlistEntry.findMany({
      where: {
        userId,
        status: 'OFFERED',
        offerExpiresAt: { gt: now },
      },
      include: {
        show: {
          include: {
            event: { select: { id: true, title: true, type: true } },
            venue: { select: { id: true, name: true, location: true } },
            showPrices: true,
          },
        },
        category: { select: { id: true, name: true } },
      },
    });

    const offers = [];

    for (const entry of activeEntries) {
      const showSeat = await prisma.showSeat.findFirst({
        where: {
          showId: entry.showId,
          status: 'HELD',
          heldByUserId: userId,
          seat: { seatCategoryId: entry.seatCategoryId },
        },
        include: { seat: true },
      });

      if (showSeat) {
        const showPrice = entry.show.showPrices.find((sp) => sp.seatCategoryId === entry.seatCategoryId);
        offers.push({
          waitlistEntryId: entry.id,
          showId: entry.showId,
          eventId: entry.show.eventId,
          eventTitle: entry.show.event.title,
          venueName: entry.show.venue.name,
          seatCategoryId: entry.seatCategoryId,
          categoryName: entry.category.name,
          seatId: showSeat.seatId,
          seatLabel: `${showSeat.seat.row}${showSeat.seat.number}`,
          price: showPrice ? Number(showPrice.price) : 0,
          offerExpiresAt: entry.offerExpiresAt ? entry.offerExpiresAt.toISOString() : now.toISOString(),
        });
      }
    }

    res.status(200).json({ offers });
  } catch (error) {
    console.error('[Waitlist] Get my offers error:', error);
    res.status(500).json({ error: { message: 'Internal server error fetching waitlist offers', status: 500 } });
  }
};

export const cancelWaitlistOffer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { waitlistEntryId } = req.params;

  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  const userId = req.user.id;

  try {
    const entry = await prisma.waitlistEntry.findUnique({
      where: { id: waitlistEntryId },
      include: { category: true },
    });

    if (!entry || entry.userId !== userId) {
      res.status(404).json({ error: { message: 'Waitlist offer not found', status: 404 } });
      return;
    }

    if (entry.status !== 'OFFERED') {
      res.status(400).json({ error: { message: 'Waitlist entry is not an active offer', status: 400 } });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.waitlistEntry.update({
        where: { id: waitlistEntryId },
        data: { status: 'EXPIRED' },
      });

      const showSeat = await tx.showSeat.findFirst({
        where: {
          showId: entry.showId,
          status: 'HELD',
          heldByUserId: userId,
          seat: { seatCategoryId: entry.seatCategoryId },
        },
      });

      if (showSeat) {
        const lockKey = `show:${entry.showId}:seat:${showSeat.seatId}:hold`;
        await redis.del(lockKey);

        const io = req.app.get('io');
        await offerSeatToWaitlistOrRelease(tx, entry.showId, showSeat.seatId, entry.seatCategoryId, showSeat.id, io);
      }
    });

    res.status(200).json({ message: 'Waitlist offer cancelled. Passed to next in queue.' });
  } catch (error) {
    console.error('[Waitlist] Cancel offer error:', error);
    res.status(500).json({ error: { message: 'Internal server error cancelling waitlist offer', status: 500 } });
  }
};

export const confirmWaitlistOffer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { waitlistEntryId } = req.params;

  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  const userId = req.user.id;

  try {
    const entry = await prisma.waitlistEntry.findUnique({
      where: { id: waitlistEntryId },
      include: {
        show: {
          include: {
            event: true,
            venue: true,
            showPrices: true,
          },
        },
      },
    });

    if (!entry || entry.userId !== userId) {
      res.status(404).json({ error: { message: 'Waitlist offer not found', status: 404 } });
      return;
    }

    if (entry.status !== 'OFFERED') {
      res.status(400).json({ error: { message: 'Waitlist offer is no longer active', status: 400 } });
      return;
    }

    const showSeat = await prisma.showSeat.findFirst({
      where: {
        showId: entry.showId,
        status: 'HELD',
        heldByUserId: userId,
        seat: { seatCategoryId: entry.seatCategoryId },
      },
      include: { seat: true },
    });

    if (!showSeat) {
      res.status(400).json({ error: { message: 'Offered seat is no longer available', status: 400 } });
      return;
    }

    const showPriceObj = entry.show.showPrices.find((sp) => sp.seatCategoryId === entry.seatCategoryId);
    const seatPrice = showPriceObj ? Number(showPriceObj.price) : 0;
    const bookingReference = 'BK-WL-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const booking = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.create({
        data: {
          bookingReference,
          userId,
          showId: entry.showId,
          status: 'CONFIRMED',
          totalAmount: seatPrice,
        },
      });

      await tx.showSeat.update({
        where: { id: showSeat.id },
        data: {
          status: 'BOOKED',
          bookingId: b.id,
          heldByUserId: null,
          heldUntil: null,
        },
      });

      await tx.waitlistEntry.update({
        where: { id: waitlistEntryId },
        data: { status: 'CONFIRMED' },
      });

      return b;
    });

    const lockKey = `show:${entry.showId}:seat:${showSeat.seatId}:hold`;
    await redis.del(lockKey);

    const io = req.app.get('io');
    if (io) {
      io.to(`show:${entry.showId}`).emit('seatStatusChanged', {
        seatId: showSeat.seatId,
        status: 'BOOKED',
        heldByUserId: null,
        heldUntil: null,
      });
    }

    const seatLabel = `${showSeat.seat.row}${showSeat.seat.number}`;
    const qrCodeDataUrl = await QRCode.toDataURL(bookingReference);

    sendTicketEmail({
      to: req.user.email,
      bookingReference,
      eventTitle: entry.show.event.title,
      venueName: entry.show.venue.name,
      venueLocation: entry.show.venue.location,
      startTime: entry.show.startTime.toISOString(),
      seats: [seatLabel],
      totalPrice: seatPrice,
      qrCodeDataUrl,
    }).catch(() => {});

    res.status(200).json({
      message: 'Waitlist offer confirmed & ticket booked!',
      booking: {
        id: booking.id,
        bookingReference,
        totalPrice: seatPrice,
        seats: [seatLabel],
        qrCodeDataUrl,
      },
    });
  } catch (error) {
    console.error('[Waitlist] Confirm offer error:', error);
    res.status(500).json({ error: { message: 'Internal server error confirming waitlist offer', status: 500 } });
  }
};
