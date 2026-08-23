import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';
import { prisma } from '../src/services/db.service';
import { redis } from '../src/src/../services/redis.service';

const API_URL = 'http://localhost:5000/api';

describe('Waitlist Queue & Offer Cascading Integration Test', () => {
  let adminToken: string;
  let organiserToken: string;
  let userAToken: string;
  let userBToken: string;
  let userCToken: string;

  let userAId: string;
  let userBId: string;
  let userCId: string;

  let venueId: string;
  let showId: string;
  let seatId: string;
  let categoryId: string;

  beforeAll(async () => {
    // 1. Register users
    const registerUser = async (email: string, role: string) => {
      const res = await axios.post(`${API_URL}/auth/register`, {
        email,
        password: 'password123',
        role,
      });
      return { token: res.data.token, userId: res.data.userId || '' };
    };

    const timestamp = Date.now();
    const admin = await registerUser(`wl_admin_${timestamp}@test.com`, 'ADMIN');
    adminToken = admin.token;

    const org = await registerUser(`wl_org_${timestamp}@test.com`, 'ORGANISER');
    organiserToken = org.token;

    const userA = await registerUser(`wl_user_a_${timestamp}@test.com`, 'CUSTOMER');
    userAToken = userA.token;
    userAId = userA.userId;

    const userB = await registerUser(`wl_user_b_${timestamp}@test.com`, 'CUSTOMER');
    userBToken = userB.token;
    userBId = userB.userId;

    const userC = await registerUser(`wl_user_c_${timestamp}@test.com`, 'CUSTOMER');
    userCToken = userC.token;
    userCId = userC.userId;

    // Get real DB user IDs if not returned in registration
    const dbUserA = await prisma.user.findFirst({ where: { email: `wl_user_a_${timestamp}@test.com` } });
    const dbUserB = await prisma.user.findFirst({ where: { email: `wl_user_b_${timestamp}@test.com` } });
    const dbUserC = await prisma.user.findFirst({ where: { email: `wl_user_c_${timestamp}@test.com` } });
    userAId = dbUserA!.id;
    userBId = dbUserB!.id;
    userCId = dbUserC!.id;

    // 2. Admin creates a tiny venue
    const venueRes = await axios.post(
      `${API_URL}/admin/venues`,
      { name: 'Tiny Box Theatre', location: 'Section 4' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    venueId = venueRes.data.venue.id;

    // 3. Admin defines layout (1 seat category, 1 seat)
    const layoutRes = await axios.post(
      `${API_URL}/admin/venues/${venueId}/layout`,
      {
        categories: [{ name: 'Standard Seat', priceMultiplier: 1.0 }],
        seats: [{ row: 'A', number: 1, categoryName: 'Standard Seat' }],
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(layoutRes.status).toBe(200);

    // Fetch details to retrieve seat and category IDs
    const detailsRes = await axios.get(`${API_URL}/admin/venues/${venueId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    seatId = detailsRes.data.venue.seats[0].id;
    categoryId = detailsRes.data.venue.seatCategories[0].id;

    // 4. Organiser schedules a showtime for this event
    const showRes = await axios.post(
      `${API_URL}/organiser/events`,
      {
        title: 'Mono Acoustic Night',
        description: 'Exclusive 1-person show',
        type: 'CONCERT',
        venueId,
        startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        prices: [{ seatCategoryId: categoryId, price: 50.0 }],
      },
      { headers: { Authorization: `Bearer ${organiserToken}` } }
    );
    showId = showRes.data.show.id;
  });

  it('should walk through: booking cancelled -> offer User B -> User B expires -> User C offered', async () => {
    // Step 1: User A holds the seat
    const holdRes = await axios.post(
      `${API_URL}/shows/${showId}/hold`,
      { seatIds: [seatId] },
      { headers: { Authorization: `Bearer ${userAToken}` } }
    );
    expect(holdRes.status).toBe(200);

    // Step 2: User A checkouts and books the seat (fully booked!)
    const bookRes = await axios.post(
      `${API_URL}/shows/${showId}/checkout`,
      { seatIds: [seatId] },
      { headers: { Authorization: `Bearer ${userAToken}` } }
    );
    expect(bookRes.status).toBe(200);
    const bookingId = bookRes.data.booking.id;

    // Step 3: User B joins waitlist (FIFO position 1)
    const wlBRes = await axios.post(
      `${API_URL}/shows/${showId}/waitlist`,
      { seatCategoryId: categoryId },
      { headers: { Authorization: `Bearer ${userBToken}` } }
    );
    expect(wlBRes.status).toBe(200);
    expect(wlBRes.data.waitlistEntry.position).toBe(1);
    const waitlistEntryBId = wlBRes.data.waitlistEntry.id;

    // Step 4: User C joins waitlist (FIFO position 2)
    const wlCRes = await axios.post(
      `${API_URL}/shows/${showId}/waitlist`,
      { seatCategoryId: categoryId },
      { headers: { Authorization: `Bearer ${userCToken}` } }
    );
    expect(wlCRes.status).toBe(200);
    expect(wlCRes.data.waitlistEntry.position).toBe(2);
    const waitlistEntryCId = wlCRes.data.waitlistEntry.id;

    // Step 5: User A cancels their booking
    const cancelRes = await axios.post(
      `${API_URL}/bookings/${bookingId}/cancel`,
      {},
      { headers: { Authorization: `Bearer ${userAToken}` } }
    );
    expect(cancelRes.status).toBe(200);

    // Assert that User B's waitlist entry status is updated to OFFERED
    const wlBState = await prisma.waitlistEntry.findUnique({ where: { id: waitlistEntryBId } });
    expect(wlBState!.status).toBe('OFFERED');

    // Assert that User B holds the seat lock in PostgreSQL
    const seatState = await prisma.showSeat.findUnique({ where: { showId_seatId: { showId, seatId } } });
    expect(seatState!.status).toBe('HELD');
    expect(seatState!.heldByUserId).toBe(userBId);

    // Step 6: Simulate expiration of User B's offer
    // Manually shift the db times back, and delete Redis key to simulate lock expiry
    const pastDate = new Date(Date.now() - 1000 * 600); // 10 minutes ago
    await prisma.waitlistEntry.update({
      where: { id: waitlistEntryBId },
      data: { offerExpiresAt: pastDate },
    });
    await prisma.showSeat.update({
      where: { showId_seatId: { showId, seatId } },
      data: { heldUntil: pastDate },
    });
    // Delete Redis hold key
    const lockKey = `show:${showId}:seat:${seatId}:hold`;
    await redis.del(lockKey);

    console.log('[Test] Simulated User B offer expiration. Waiting for sweeper sweep...');
    
    // Sleep 12 seconds to let the sweeper interval run in the background (interval = 10s)
    await new Promise((resolve) => setTimeout(resolve, 12000));

    // Assert User B's waitlist has expired
    const wlBExpired = await prisma.waitlistEntry.findUnique({ where: { id: waitlistEntryBId } });
    expect(wlBExpired!.status).toBe('EXPIRED');

    // Assert User C's waitlist has transitioned to OFFERED
    const wlCOffered = await prisma.waitlistEntry.findUnique({ where: { id: waitlistEntryCId } });
    expect(wlCOffered!.status).toBe('OFFERED');

    // Assert seat lock transferred to User C in PostgreSQL
    const seatStateC = await prisma.showSeat.findUnique({ where: { showId_seatId: { showId, seatId } } });
    expect(seatStateC!.status).toBe('HELD');
    expect(seatStateC!.heldByUserId).toBe(userCId);

    console.log('✔ Waitlist integration test successfully passed!');
  }, 30000);
});
