import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seeding database...');

  // Clean existing database
  console.log('Cleaning existing tables...');
  await prisma.showSeat.deleteMany({});
  await prisma.showPrice.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.waitlistEntry.deleteMany({});
  await prisma.show.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.seat.deleteMany({});
  await prisma.seatCategory.deleteMany({});
  await prisma.venue.deleteMany({});
  await prisma.user.deleteMany({});

  // Hash password
  const passwordHash = bcrypt.hashSync('password123', 10);

  // 1. Create Users
  const organiser = await prisma.user.create({
    data: {
      email: 'organiser@test.com',
      passwordHash,
      role: 'ORGANISER',
    },
  });

  const customer = await prisma.user.create({
    data: {
      email: 'customer@test.com',
      passwordHash,
      role: 'CUSTOMER',
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@test.com',
      passwordHash,
      role: 'ADMIN',
    },
  });

  // 2. Create Venue
  const venue = await prisma.venue.create({
    data: {
      name: 'Starlight Amphitheatre',
      location: 'Central Park, New York',
    },
  });

  // 3. Create Seat Categories
  const premiumCategory = await prisma.seatCategory.create({
    data: {
      name: 'Premium',
      venueId: venue.id,
    },
  });

  const standardCategory = await prisma.seatCategory.create({
    data: {
      name: 'Standard',
      venueId: venue.id,
    },
  });

  // 4. Create Seats (5 rows x 10 seats = 50 seats)
  const rows = ['A', 'B', 'C', 'D', 'E'];
  const seatsData = [];

  for (const row of rows) {
    // Rows A & B are Premium, C, D & E are Standard
    const isPremium = row === 'A' || row === 'B';
    const categoryId = isPremium ? premiumCategory.id : standardCategory.id;

    for (let num = 1; num <= 10; num++) {
      seatsData.push({
        venueId: venue.id,
        seatCategoryId: categoryId,
        row,
        number: num,
      });
    }
  }

  console.log(`Generating ${seatsData.length} seats for venue...`);
  await prisma.seat.createMany({
    data: seatsData,
  });

  // Fetch created seats to map their IDs
  const allSeats = await prisma.seat.findMany({
    where: { venueId: venue.id },
  });

  // 5. Create Event
  const event = await prisma.event.create({
    data: {
      title: 'Rock Legends Concert Live',
      description: 'An evening of classic rock featuring legendary bands performing their greatest hits live.',
      type: 'CONCERT',
      organiserId: organiser.id,
    },
  });

  // 6. Create Show (5 days from now at 7:30 PM)
  const showTime = new Date();
  showTime.setDate(showTime.getDate() + 5);
  showTime.setHours(19, 30, 0, 0);

  const show = await prisma.show.create({
    data: {
      eventId: event.id,
      venueId: venue.id,
      startTime: showTime,
    },
  });

  // 7. Create Show Prices for categories
  await prisma.showPrice.createMany({
    data: [
      {
        showId: show.id,
        seatCategoryId: premiumCategory.id,
        price: 120.0,
      },
      {
        showId: show.id,
        seatCategoryId: standardCategory.id,
        price: 60.0,
      },
    ],
  });

  // 8. Initialize Show Seats status as AVAILABLE per seat for this show
  console.log('Initializing seat statuses for the show...');
  const showSeatsData = allSeats.map((seat) => ({
    showId: show.id,
    seatId: seat.id,
    status: 'AVAILABLE' as const,
  }));

  await prisma.showSeat.createMany({
    data: showSeatsData,
  });

  console.log('Seeding completed successfully!');
  console.log('---------------------------------');
  console.log(`Organiser: ${organiser.email} / password123`);
  console.log(`Customer:  ${customer.email} / password123`);
  console.log(`Admin:     ${admin.email} / password123`);
  console.log(`Venue:     ${venue.name} (${venue.location})`);
  console.log(`Event:     ${event.title}`);
  console.log(`Showtime:  ${showTime.toISOString()}`);
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
