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
      // 1. Delete all existing seats and categories for this venue
      await tx.seat.deleteMany({ where: { venueId } });
      await tx.seatCategory.deleteMany({ where: { venueId } });

      // 2. Create the new seat categories
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

      // 3. Create the seats
      const seatsToCreate = seats.map((seat) => {
        const catId = categoryMap[seat.categoryName];
        if (!catId) {
          throw new Error(`Category "${seat.categoryName}" referenced by seat row ${seat.row} col ${seat.number} was not defined.`);
        }
        return {
          venueId,
          seatCategoryId: catId,
          row: seat.row,
          number: seat.number,
        };
      });

      if (seatsToCreate.length > 0) {
        await tx.seat.createMany({
          data: seatsToCreate,
        });
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
