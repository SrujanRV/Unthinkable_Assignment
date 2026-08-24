import { Response } from 'express';
import { prisma } from '../services/db.service';
import { redis } from '../services/redis.service';
import { sendEventCancellationEmail } from '../services/email.service';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { EventType } from '@prisma/client';

// Zod validation schemas
const CreateListingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  type: z.nativeEnum(EventType),
  posterUrl: z.string().nullable().optional().or(z.literal('')),
  venueId: z.string().uuid('Invalid venue ID'),
  startTime: z.string().min(1, 'Start time is required'),
  prices: z.array(
    z.object({
      seatCategoryId: z.string().uuid('Invalid seat category ID'),
      price: z.number().positive('Price must be positive'),
    })
  ).min(1, 'At least one seat category price is required'),
});

const UpdateListingSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().min(1, 'Description is required').optional(),
  type: z.nativeEnum(EventType).optional(),
  posterUrl: z.string().nullable().optional().or(z.literal('')),
  // Optional show updates
  showId: z.string().uuid('Invalid show ID').optional(),
  startTime: z.string().optional(),
  prices: z.array(
    z.object({
      seatCategoryId: z.string().uuid('Invalid seat category ID'),
      price: z.number().positive('Price must be positive'),
    })
  ).optional(),
});

export const createListing = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      return;
    }

    const validation = CreateListingSchema.safeParse(req.body);
    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const errorMsg = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${(errs || []).join(', ')}`)
        .join('; ');
      res.status(400).json({ error: { message: `Validation failed: ${errorMsg}`, details: fieldErrors, status: 400 } });
      return;
    }

    const { title, description, type, posterUrl, venueId, startTime, prices } = validation.data;

    // Verify venue exists
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { seatCategories: true, seats: true },
    });

    if (!venue) {
      res.status(404).json({ error: { message: 'Venue not found', status: 404 } });
      return;
    }

    // Verify all venue seat categories are priced
    const venueCatIds = venue.seatCategories.map((c) => c.id);
    const providedCatIds = prices.map((p) => p.seatCategoryId);
    const missingCats = venueCatIds.filter((id) => !providedCatIds.includes(id));

    if (missingCats.length > 0) {
      res.status(400).json({
        error: { message: 'All seat categories for this venue must be assigned a price', status: 400 },
      });
      return;
    }

    // Create event, show, show prices, and initialize show seats in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Event
      const event = await tx.event.create({
        data: {
          title,
          description,
          type,
          posterUrl,
          organiserId: req.user!.id,
        },
      });

      // 2. Create Show
      const show = await tx.show.create({
        data: {
          eventId: event.id,
          venueId,
          startTime: new Date(startTime),
        },
      });

      // 3. Create Show Prices
      await tx.showPrice.createMany({
        data: prices.map((p) => ({
          showId: show.id,
          seatCategoryId: p.seatCategoryId,
          price: p.price,
        })),
      });

      // 4. Initialize Show Seats (status = AVAILABLE) for all physical venue seats
      const showSeatsData = venue.seats.map((seat) => ({
        showId: show.id,
        seatId: seat.id,
        status: 'AVAILABLE' as const,
      }));

      if (showSeatsData.length > 0) {
        await tx.showSeat.createMany({
          data: showSeatsData,
        });
      }

      return { event, show };
    });

    res.status(210).json({
      message: 'Event listing and showtime created successfully',
      event: result.event,
      show: result.show,
    });
  } catch (error) {
    console.error('[Organiser] Create listing error:', error);
    res.status(500).json({ error: { message: 'Internal server error creating listing', status: 500 } });
  }
};

export const listMyEvents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      return;
    }

    const events = await prisma.event.findMany({
      where: { organiserId: req.user.id },
      include: {
        shows: {
          include: {
            venue: { select: { id: true, name: true, location: true } },
            showPrices: {
              include: { category: { select: { name: true } } },
            },
            _count: {
              select: {
                showSeats: true, // total seats
              },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ events });
  } catch (error) {
    console.error('[Organiser] List my events error:', error);
    res.status(500).json({ error: { message: 'Internal server error listing events', status: 500 } });
  }
};

export const updateListing = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { eventId } = req.params;

  try {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      return;
    }

    const validation = UpdateListingSchema.safeParse(req.body);
    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const errorMsg = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${(errs || []).join(', ')}`)
        .join('; ');
      res.status(400).json({ error: { message: `Validation failed: ${errorMsg}`, details: fieldErrors, status: 400 } });
      return;
    }

    // Verify ownership
    const existingEvent = await prisma.event.findFirst({
      where: { id: eventId, organiserId: req.user.id },
    });

    if (!existingEvent) {
      res.status(404).json({ error: { message: 'Event not found or access denied', status: 404 } });
      return;
    }

    const { title, description, type, posterUrl, showId, startTime, prices } = validation.data;

    await prisma.$transaction(async (tx) => {
      // 1. Update event metadata if provided
      if (title || description || type || posterUrl !== undefined) {
        await tx.event.update({
          where: { id: eventId },
          data: { title, description, type, posterUrl },
        });
      }

      // 2. Update show details if provided
      if (showId) {
        // Validate show belongs to this event
        const show = await tx.show.findFirst({
          where: { id: showId, eventId },
        });

        if (!show) {
          throw new Error('Show does not belong to this event');
        }

        if (startTime) {
          await tx.show.update({
            where: { id: showId },
            data: { startTime: new Date(startTime) },
          });
        }

        if (prices && prices.length > 0) {
          // Update prices (using upsert or deleteMany + createMany)
          for (const p of prices) {
            await tx.showPrice.upsert({
              where: {
                showId_seatCategoryId: {
                  showId,
                  seatCategoryId: p.seatCategoryId,
                },
              },
              update: { price: p.price },
              create: {
                showId,
                seatCategoryId: p.seatCategoryId,
                price: p.price,
              },
            });
          }
        }
      }
    });

    res.status(200).json({
      message: 'Event listing updated successfully',
    });
  } catch (error: any) {
    console.error('[Organiser] Update listing error:', error);
    res.status(500).json({ error: { message: error.message || 'Internal server error updating listing', status: 500 } });
  }
};

export const getDashboardMetrics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  const organiserId = req.user.id;

  try {
    const events = await prisma.event.findMany({
      where: { organiserId },
      include: {
        shows: {
          include: {
            venue: { select: { name: true } },
            showPrices: true,
            showSeats: {
              select: {
                status: true,
                seat: { select: { seatCategoryId: true } },
              },
            },
            bookings: {
              where: { status: 'CONFIRMED' },
              select: {
                createdAt: true,
                totalAmount: true,
                showSeats: { select: { id: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    const metrics = events.map((event) => {
      const showMetrics = event.shows.map((show) => {
        const priceMap: { [catId: string]: number } = {};
        show.showPrices.forEach((sp) => {
          priceMap[sp.seatCategoryId] = Number(sp.price);
        });

        const totalSeats = show.showSeats.length;
        const bookedSeats = show.showSeats.filter((ss) => ss.status === 'BOOKED').length;

        let totalRevenue = 0;
        show.showSeats.forEach((ss) => {
          if (ss.status === 'BOOKED') {
            totalRevenue += priceMap[ss.seat.seatCategoryId] || 0;
          }
        });

        const bookingTimeline = show.bookings.map((b) => ({
          date: b.createdAt.toISOString(),
          amount: Number(b.totalAmount),
          ticketsCount: b.showSeats.length,
        }));

        return {
          id: show.id,
          startTime: show.startTime.toISOString(),
          venueName: show.venue.name,
          totalSeats,
          bookedSeats,
          revenue: totalRevenue,
          timeline: bookingTimeline,
        };
      });

      return {
        eventId: event.id,
        title: event.title,
        type: event.type,
        shows: showMetrics,
      };
    });

    res.status(200).json({ metrics });
  } catch (error) {
    console.error('[Organiser Dashboard] Metrics error:', error);
    res.status(500).json({ error: { message: 'Internal server error retrieving metrics', status: 500 } });
  }
};

export const cancelEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { eventId } = req.params;

  try {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      return;
    }

    // 1. Fetch event with shows, seats, confirmed bookings, and waitlist
    const event = await prisma.event.findFirst({
      where: { id: eventId, organiserId: req.user.id },
      include: {
        shows: {
          include: {
            showSeats: {
              include: { seat: { include: { category: true } } },
            },
            bookings: {
              where: { status: 'CONFIRMED' },
              include: {
                user: { select: { email: true } },
                showSeats: { include: { seat: true } },
              },
            },
            waitlistEntries: {
              where: { status: { in: ['WAITING', 'OFFERED'] } },
            },
          },
        },
      },
    });

    if (!event) {
      res.status(404).json({ error: { message: 'Event not found or access denied', status: 404 } });
      return;
    }

    if (event.isCancelled) {
      res.status(400).json({ error: { message: 'Event is already cancelled', status: 400 } });
      return;
    }

    // 2. Perform cancellation inside a database transaction
    await prisma.$transaction(async (tx) => {
      // A. Mark event as cancelled
      await tx.event.update({
        where: { id: eventId },
        data: { isCancelled: true },
      });

      // B. Process each show
      for (const show of event.shows) {
        // I. Release show seats in Postgres
        await tx.showSeat.updateMany({
          where: { showId: show.id },
          data: {
            status: 'AVAILABLE',
            heldByUserId: null,
            heldUntil: null,
            bookingId: null,
          },
        });

        // II. Cancel all waitlist entries in Postgres
        await tx.waitlistEntry.deleteMany({
          where: { showId: show.id },
        });

        // III. Cancel all confirmed bookings for this show
        await tx.booking.updateMany({
          where: { showId: show.id, status: 'CONFIRMED' },
          data: {
            status: 'CANCELLED',
            cancellationReason: 'Event cancelled by organiser',
          },
        });

        // IV. Release locks in Redis for all show seats
        const redisKeys = show.showSeats.map((ss) => `show:${show.id}:seat:${ss.seatId}:hold`);
        if (redisKeys.length > 0) {
          await redis.del(...redisKeys);
        }
      }
    });

    // 3. Dispatch emails & Socket.io broadcasts
    const io = req.app.get('io');

    for (const show of event.shows) {
      // A. Send cancellation emails to all affected booking owners
      for (const booking of show.bookings) {
        const seatLabels = booking.showSeats.map(
          (ss) => `${ss.seat.row}${ss.seat.number}`
        );
        sendEventCancellationEmail({
          to: booking.user.email,
          bookingReference: booking.bookingReference,
          eventTitle: event.title,
          startTime: show.startTime.toISOString(),
          seats: seatLabels,
          refundAmount: Number(booking.totalAmount),
        }).catch((err) => {
          console.error(`Failed to send cancellation email to ${booking.user.email}:`, err);
        });
      }

      // B. Broadcast AVAILABLE status for every seat via Socket.io
      if (io) {
        show.showSeats.forEach((ss) => {
          io.to(`show:${show.id}`).emit('seatStatusChanged', {
            seatId: ss.seatId,
            status: 'AVAILABLE',
            heldByUserId: null,
            heldUntil: null,
          });
        });
      }
    }

    res.status(200).json({ message: 'Event and all related bookings cancelled successfully' });
  } catch (error) {
    console.error('[Organiser] Cancel event error:', error);
    res.status(500).json({ error: { message: 'Internal server error cancelling event', status: 500 } });
  }
};
