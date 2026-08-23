import { Request, Response } from 'express';
import { prisma } from '../services/db.service';
import { z } from 'zod';

// Zod validation schemas
const CreateVenueSchema = z.object({
  name: z.string().min(1, 'Venue name is required'),
  location: z.string().min(1, 'Venue location is required'),
});

const SaveLayoutSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string().min(1, 'Category name is required'),
      priceMultiplier: z.number().positive('Multiplier must be positive'),
    })
  ),
  seats: z.array(
    z.object({
      row: z.string().min(1, 'Row identifier is required'),
      number: z.number().int().positive('Seat number must be positive'),
      categoryName: z.string().min(1, 'Category name is required'),
    })
  ),
});

export const createVenue = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = CreateVenueSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: { message: 'Validation failed', details: validation.error.flatten().fieldErrors, status: 400 } });
      return;
    }

    const { name, location } = validation.data;

    const venue = await prisma.venue.create({
      data: { name, location },
    });

    res.status(210).json({
      message: 'Venue created successfully',
      venue,
    });
  } catch (error) {
    console.error('[Admin] Create venue error:', error);
    res.status(500).json({ error: { message: 'Internal server error creating venue', status: 500 } });
  }
};

export const listVenues = async (req: Request, res: Response): Promise<void> => {
  try {
    const venues = await prisma.venue.findMany({
      include: {
        _count: {
          select: { seats: true, shows: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.status(200).json({ venues });
  } catch (error) {
    console.error('[Admin] List venues error:', error);
    res.status(500).json({ error: { message: 'Internal server error listing venues', status: 500 } });
  }
};

export const getVenueDetails = async (req: Request, res: Response): Promise<void> => {
  const { venueId } = req.params;

  try {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        seatCategories: {
          orderBy: { name: 'asc' },
        },
        seats: {
          include: {
            category: true,
          },
          orderBy: [{ row: 'asc' }, { number: 'asc' }],
        },
      },
    });

    if (!venue) {
      res.status(404).json({ error: { message: 'Venue not found', status: 404 } });
      return;
    }

    const formattedSeats = venue.seats.map((seat) => ({
      id: seat.id,
      row: seat.row,
      number: seat.number,
      categoryName: seat.category.name,
    }));

    res.status(200).json({
      venue: {
        id: venue.id,
        name: venue.name,
        location: venue.location,
        createdAt: venue.createdAt,
        updatedAt: venue.updatedAt,
        seatCategories: venue.seatCategories,
        seats: formattedSeats,
      },
    });
  } catch (error) {
    console.error('[Admin] Get venue details error:', error);
    res.status(500).json({ error: { message: 'Internal server error fetching venue details', status: 500 } });
  }
};

export const saveVenueLayout = async (req: Request, res: Response): Promise<void> => {
  const { venueId } = req.params;

  try {
    const validation = SaveLayoutSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: { message: 'Validation failed', details: validation.error.flatten().fieldErrors, status: 400 } });
      return;
    }

    const { categories, seats } = validation.data;

    // Check if venue exists
    const venueExists = await prisma.venue.findUnique({
      where: { id: venueId },
    });

    if (!venueExists) {
      res.status(404).json({ error: { message: 'Venue not found', status: 404 } });
      return;
    }

    // Run within database transaction to guarantee atomicity and integrity
    await prisma.$transaction(async (tx) => {
      // 1. Query existing shows of this venue
      const venueShows = await tx.show.findMany({
        where: { venueId },
        include: {
          showPrices: {
            include: {
              category: { select: { name: true } },
            },
          },
        },
      });
      const showIds = venueShows.map((s) => s.id);

      // 2. Fetch existing confirmed bookings for these shows
      const existingBookings = await tx.booking.findMany({
        where: { showId: { in: showIds }, status: 'CONFIRMED' },
        include: {
          showSeats: {
            include: {
              seat: { select: { row: true, number: true } },
            },
          },
        },
      });

      // 3. Map booking coordinates
      const bookingMap: { [showId: string]: { [coord: string]: string } } = {};
      existingBookings.forEach((b) => {
        if (!bookingMap[b.showId]) {
          bookingMap[b.showId] = {};
        }
        b.showSeats.forEach((ss) => {
          if (ss.seat) {
            const key = `${ss.seat.row}-${ss.seat.number}`;
            bookingMap[b.showId][key] = b.id;
          }
        });
      });

      // 4. Map existing show prices by category name
      const showPricesMap: { [showId: string]: { [catName: string]: number } } = {};
      venueShows.forEach((s) => {
        showPricesMap[s.id] = {};
        s.showPrices.forEach((sp) => {
          showPricesMap[s.id][sp.category.name] = Number(sp.price);
        });
      });

      // 5. Delete waitlist entries, old seats, and old categories
      await tx.waitlistEntry.deleteMany({ where: { showId: { in: showIds } } });
      await tx.seat.deleteMany({ where: { venueId } });
      await tx.seatCategory.deleteMany({ where: { venueId } });

      // 6. Create the new seat categories
      const categoryMap: { [name: string]: string } = {};
      for (const cat of categories) {
        const dbCat = await tx.seatCategory.create({
          data: {
            name: cat.name,
            priceMultiplier: cat.priceMultiplier,
            venueId,
          },
        });
        categoryMap[cat.name] = dbCat.id;
      }

      // 7. Create the new seats and retrieve their IDs
      const dbSeats: any[] = [];
      for (const seat of seats) {
        const catId = categoryMap[seat.categoryName];
        if (!catId) {
          throw new Error(`Category "${seat.categoryName}" referenced by seat row ${seat.row} col ${seat.number} was not defined.`);
        }
        const dbSeat = await tx.seat.create({
          data: {
            venueId,
            seatCategoryId: catId,
            row: seat.row,
            number: seat.number,
          },
        });
        dbSeats.push(dbSeat);
      }

      // 8. Recreate ShowPrice and ShowSeat records for all existing shows
      for (const show of venueShows) {
        // Recreate pricing mappings
        for (const catName of Object.keys(categoryMap)) {
          const newCatId = categoryMap[catName];
          const oldPrice = showPricesMap[show.id]?.[catName] || 50.0;

          await tx.showPrice.create({
            data: {
              showId: show.id,
              seatCategoryId: newCatId,
              price: oldPrice,
            },
          });
        }

        // Recreate show seats and map legacy bookings
        for (const seat of dbSeats) {
          const coordKey = `${seat.row}-${seat.number}`;
          const existingBookingId = bookingMap[show.id]?.[coordKey] || null;
          const status = existingBookingId ? 'BOOKED' : 'AVAILABLE';

          await tx.showSeat.create({
            data: {
              showId: show.id,
              seatId: seat.id,
              status,
              bookingId: existingBookingId,
            },
          });
        }
      }
    });

    res.status(200).json({
      message: 'Venue layout saved successfully',
    });
  } catch (error: any) {
    console.error('[Admin] Save layout error:', error);
    res.status(500).json({ error: { message: error.message || 'Internal server error saving layout', status: 500 } });
  }
};
