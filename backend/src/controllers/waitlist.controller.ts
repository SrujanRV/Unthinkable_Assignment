import { Response } from 'express';
import { prisma } from '../services/db.service';
import { redis } from '../services/redis.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendTicketEmail } from '../services/email.service';
import jwt from 'jsonwebtoken';

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
      for (const showSeat of booking.showSeats) {
        const catId = showSeat.seat.seatCategoryId;

        // Check if there is an active waitlisted customer (FIFO: position ascending)
        const nextInQueue = await tx.waitlistEntry.findFirst({
          where: {
            showId: booking.showId,
            seatCategoryId: catId,
            status: 'WAITING',
          },
          orderBy: { position: 'asc' },
          include: { user: true },
        });

        if (nextInQueue) {
          const offerExpiry = new Date(Date.now() + OFFER_TTL_SECONDS * 1000);

          // Update next queue position to OFFERED
          await tx.waitlistEntry.update({
            where: { id: nextInQueue.id },
            data: {
              status: 'OFFERED',
              offerExpiresAt: offerExpiry,
            },
          });

          // Lock seat for this waitlisted user inside PostgreSQL (held status)
          await tx.showSeat.update({
            where: { id: showSeat.id },
            data: {
              status: 'HELD',
              heldByUserId: nextInQueue.userId,
              heldUntil: offerExpiry,
              bookingId: null, // Clear old booking reference
            },
          });

          // Set Redis lock key for nextInQueue.userId
          const lockKey = `show:${booking.showId}:seat:${showSeat.seatId}:hold`;
          await redis.set(lockKey, nextInQueue.userId, 'EX', OFFER_TTL_SECONDS, 'NX');

          // Generate signed waitlist claim token
          const token = generateClaimToken(nextInQueue.userId, booking.showId, showSeat.seatId, nextInQueue.id);
          const claimUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?claimToken=${token}`;

          // Dispatch Offer email to waitlisted user
          await sendTicketEmail({
            to: nextInQueue.user.email,
            bookingReference: `WL-OFFER-${nextInQueue.id.slice(0, 8)}`,
            eventTitle: booking.show.event.title,
            venueName: booking.showSeats[0].seat.category.name, // Display tier
            venueLocation: `Waitlist Offer: Claim inside ${OFFER_TTL_SECONDS / 60} minutes`,
            startTime: booking.show.startTime.toISOString(),
            seats: [`${showSeat.seat.row}${showSeat.seat.number}`],
            totalPrice: Number(booking.totalAmount) / booking.showSeats.length, // Avg seat price
            qrCodeDataUrl: await require('qrcode').toDataURL(claimUrl), // QR points to claim URL!
          });

          // Broadcast HELD status to active socket room clients
          const io = req.app.get('io');
          if (io) {
            io.to(`show:${booking.showId}`).emit('seatStatusChanged', {
              seatId: showSeat.seatId,
              status: 'HELD',
              heldByUserId: nextInQueue.userId,
              heldUntil: offerExpiry.toISOString(),
            });
          }
        } else {
          // No waitlist queue: return seat to AVAILABLE state
          await tx.showSeat.update({
            where: { id: showSeat.id },
            data: {
              status: 'AVAILABLE',
              heldByUserId: null,
              heldUntil: null,
              bookingId: null,
            },
          });

          // Broadcast AVAILABLE status via Socket.io
          const io = req.app.get('io');
          if (io) {
            io.to(`show:${booking.showId}`).emit('seatStatusChanged', {
              seatId: showSeat.seatId,
              status: 'AVAILABLE',
              heldByUserId: null,
              heldUntil: null,
            });
          }
        }
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
