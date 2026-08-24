import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking database seed status...');

  const eventCount = await prisma.event.count();
  if (eventCount > 0) {
    console.log('[Seed] Updating existing events with poster URLs...');
    await prisma.event.updateMany({
      where: { title: { contains: 'Rock Legends' } },
      data: { posterUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80' },
    });
    await prisma.event.updateMany({
      where: { title: { contains: 'Symphonic' } },
      data: { posterUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80' },
    });
    await prisma.event.updateMany({
      where: { title: { contains: 'Inception' } },
      data: { posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80' },
    });
    await prisma.event.updateMany({
      where: { title: { contains: 'Interstellar' } },
      data: { posterUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80' },
    });
    // Backfill any remaining null posterUrls by event type
    await prisma.event.updateMany({
      where: { type: 'CONCERT', posterUrl: null },
      data: { posterUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80' },
    });
    await prisma.event.updateMany({
      where: { type: 'MOVIE', posterUrl: null },
      data: { posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80' },
    });
    console.log('[Seed] Poster URLs backfilled successfully.');
    return;
  }

  console.log('Seeding initial events, venues, showtimes, seats, and test accounts...');

  // Hash password
  const passwordHash = bcrypt.hashSync('password123', 10);

  // 1. Create/Upsert Users
  const organiser = await prisma.user.upsert({
    where: { email: 'organiser@test.com' },
    update: {},
    create: {
      email: 'organiser@test.com',
      passwordHash,
      role: 'ORGANISER',
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@test.com' },
    update: {},
    create: {
      email: 'customer@test.com',
      passwordHash,
      role: 'CUSTOMER',
    },
  });

  const customer2 = await prisma.user.upsert({
    where: { email: 'customer2@test.com' },
    update: {},
    create: {
      email: 'customer2@test.com',
      passwordHash,
      role: 'CUSTOMER',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      passwordHash,
      role: 'ADMIN',
    },
  });

  // 2. Create Venues
  const venueAmphitheatre = await prisma.venue.create({
    data: {
      name: 'Starlight Amphitheatre',
      location: 'Central Park, New York',
    },
  });

  const venueCinema = await prisma.venue.create({
    data: {
      name: 'Metropolitan Grand Cinema',
      location: 'Broadway, New York',
    },
  });

  // 3. Create Seat Categories & Seats for each Venue
  const venues = [venueAmphitheatre, venueCinema];
  const seatCategoriesMap: { [venueId: string]: { premiumId: string; standardId: string } } = {};

  for (const v of venues) {
    const premiumCategory = await prisma.seatCategory.create({
      data: {
        name: 'Premium',
        priceMultiplier: 1.50,
        venueId: v.id,
      },
    });

    const standardCategory = await prisma.seatCategory.create({
      data: {
        name: 'Standard',
        priceMultiplier: 1.00,
        venueId: v.id,
      },
    });

    seatCategoriesMap[v.id] = {
      premiumId: premiumCategory.id,
      standardId: standardCategory.id,
    };

    // Create 5 rows of 10 seats = 50 seats per venue
    const rows = ['A', 'B', 'C', 'D', 'E'];
    const seatsData = [];

    for (const row of rows) {
      const isPremium = row === 'A' || row === 'B';
      const categoryId = isPremium ? premiumCategory.id : standardCategory.id;

      for (let num = 1; num <= 10; num++) {
        seatsData.push({
          venueId: v.id,
          seatCategoryId: categoryId,
          row,
          number: num,
        });
      }
    }

    console.log(`Generating ${seatsData.length} seats for ${v.name}...`);
    await prisma.seat.createMany({
      data: seatsData,
    });
  }

  // 4. Create Concert Events
  const concert1 = await prisma.event.create({
    data: {
      title: 'Rock Legends Live Tour',
      description: 'An evening of classic rock featuring legendary bands performing their greatest hits live.',
      type: 'CONCERT',
      posterUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
      organiserId: organiser.id,
    },
  });

  const concert2 = await prisma.event.create({
    data: {
      title: 'Symphonic Movie Soundtracks',
      description: 'Experience your favorite movie scores performed by a full live symphony orchestra under the stars.',
      type: 'CONCERT',
      posterUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
      organiserId: organiser.id,
    },
  });

  // 5. Create Movie Events
  const movie1 = await prisma.event.create({
    data: {
      title: 'Inception: 15th Anniversary Re-Release',
      description: 'Christopher Nolan\'s mind-bending masterpiece returns to the big screen for its 15th anniversary.',
      type: 'MOVIE',
      posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80',
      organiserId: organiser.id,
    },
  });

  const movie2 = await prisma.event.create({
    data: {
      title: 'Interstellar: IMAX Experience',
      description: 'Journey beyond the stars in this epic cinematic experience, remastered for high-fidelity theater systems.',
      type: 'MOVIE',
      posterUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
      organiserId: organiser.id,
    },
  });

  // Helper to create a showtime, prices, and seats
  const setupShow = async (
    event: { id: string; title: string },
    venue: { id: string; name: string },
    daysFromNow: number,
    hour: number,
    minute: number,
    basePremiumPrice: number,
    baseStandardPrice: number
  ) => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + daysFromNow);
    startTime.setHours(hour, minute, 0, 0);

    const show = await prisma.show.create({
      data: {
        eventId: event.id,
        venueId: venue.id,
        startTime,
      },
    });

    const cats = seatCategoriesMap[venue.id];

    await prisma.showPrice.createMany({
      data: [
        {
          showId: show.id,
          seatCategoryId: cats.premiumId,
          price: basePremiumPrice,
        },
        {
          showId: show.id,
          seatCategoryId: cats.standardId,
          price: baseStandardPrice,
        },
      ],
    });

    const venueSeats = await prisma.seat.findMany({
      where: { venueId: venue.id },
    });

    const showSeatsData = venueSeats.map((seat) => ({
      showId: show.id,
      seatId: seat.id,
      status: 'AVAILABLE' as const,
    }));

    await prisma.showSeat.createMany({
      data: showSeatsData,
    });

    console.log(`Initialized showtime for "${event.title}" at "${venue.name}" on ${startTime.toLocaleString()}`);
  };

  // 6. Setup showtimes for events
  // Concerts at Starlight Amphitheatre
  await setupShow(concert1, venueAmphitheatre, 3, 19, 30, 120.0, 60.0);
  await setupShow(concert2, venueAmphitheatre, 5, 20, 0, 150.0, 75.0);

  // Movies at Metropolitan Grand Cinema
  await setupShow(movie1, venueCinema, 2, 18, 0, 22.50, 15.0);
  await setupShow(movie2, venueCinema, 4, 21, 15, 30.0, 20.0);

  console.log('Database seeding completed successfully!');
  console.log('---------------------------------');
  console.log(`Organiser: ${organiser.email} / password123`);
  console.log(`Customer:  ${customer.email} / password123`);
  console.log(`Admin:     ${admin.email} / password123`);
  console.log('---------------------------------');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
