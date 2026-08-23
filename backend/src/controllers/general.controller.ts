import { Request, Response } from 'express';
import { prisma } from '../services/db.service';

export const listVenues = async (req: Request, res: Response): Promise<void> => {
  try {
    const venues = await prisma.venue.findMany({
      include: {
        seatCategories: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.status(200).json({ venues });
  } catch (error) {
    console.error('List venues error:', error);
    res.status(500).json({ error: { message: 'Internal server error listing venues', status: 500 } });
  }
};

export const listEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await prisma.event.findMany({
      include: {
        shows: {
          include: {
            venue: { select: { name: true, location: true } },
            showPrices: {
              include: { category: { select: { name: true } } },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { title: 'asc' },
    });
    res.status(200).json({ events });
  } catch (error) {
    console.error('List events error:', error);
    res.status(500).json({ error: { message: 'Internal server error listing events', status: 500 } });
  }
};
