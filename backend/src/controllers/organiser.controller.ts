import { Response } from 'express';
import { prisma } from '../services/db.service';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { EventType } from '@prisma/client';

// Zod validation schemas
const CreateListingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  type: z.nativeEnum(EventType),
  venueId: z.string().uuid('Invalid venue ID'),
  startTime: z.string().datetime('Invalid start time format'),
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
  // Optional show updates
  showId: z.string().uuid('Invalid show ID').optional(),
  startTime: z.string().datetime('Invalid start time format').optional(),
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
      res.status(400).json({ error: { message: 'Validation failed', details: validation.error.flatten().fieldErrors, status: 400 } });
      return;
    }

    const { title, description, type, venueId, startTime, prices } = validation.data;

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
      res.status(400).json({ error: { message: 'Validation failed', details: validation.error.flatten().fieldErrors, status: 400 } });
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

    const { title, description, type, showId, startTime, prices } = validation.data;

    await prisma.$transaction(async (tx) => {
      // 1. Update event metadata if provided
      if (title || description || type) {
        await tx.event.update({
          where: { id: eventId },
          data: { title, description, type },
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
