import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { prisma } from '../src/services/db.service';
import { redis } from '../src/services/redis.service';

const API_URL = 'http://localhost:5000/api';

// Safe wrappers to prevent Axios serialization issues in Vitest workers
async function safePost(url: string, data: any, headers?: any) {
  try {
    return await axios.post(url, data, headers ? { headers } : undefined);
  } catch (err: any) {
    throw new Error(err.response?.data?.error?.message || err.message);
  }
}

async function safeGet(url: string, headers?: any) {
  try {
    return await axios.get(url, headers ? { headers } : undefined);
  } catch (err: any) {
    throw new Error(err.response?.data?.error?.message || err.message);
  }
}

describe('Event Cancellation Integration Tests', () => {
  let organiserToken: string;
  let customerToken: string;
  let eventId: string;
  let showId: string;
  let bookingId: string;

  beforeAll(async () => {
    // Login as organiser
    const orgLogin = await safePost(`${API_URL}/auth/login`, {
      email: 'organiser@test.com',
      password: 'password123',
    });
    organiserToken = orgLogin.data.token;

    // Login as customer
    const custLogin = await safePost(`${API_URL}/auth/login`, {
      email: 'customer@test.com',
      password: 'password123',
    });
    customerToken = custLogin.data.token;

    // Find a show that still has available seats (query DB directly to be resilient to prior test runs)
    const availableShowSeat = await prisma.showSeat.findFirst({
      where: { status: 'AVAILABLE' },
      include: {
        show: {
          include: { event: true },
        },
      },
    });
    expect(availableShowSeat).not.toBeNull();

    showId = availableShowSeat!.showId;
    eventId = availableShowSeat!.show.eventId;

    // Ensure the event is not already cancelled
    expect(availableShowSeat!.show.event.isCancelled).toBe(false);

    // Get 2 available seats for this show
    const allShowSeats = await prisma.showSeat.findMany({
      where: { showId, status: 'AVAILABLE' },
      take: 2,
    });
    expect(allShowSeats.length).toBeGreaterThanOrEqual(2);
    const seatIds = allShowSeats.map((s) => s.seatId);

    // Hold the seats via API
    await safePost(
      `${API_URL}/shows/${showId}/hold`,
      { seatIds },
      { Authorization: `Bearer ${customerToken}` }
    );

    // Confirm booking (checkout) via API
    const checkoutRes = await safePost(
      `${API_URL}/shows/${showId}/checkout`,
      { seatIds },
      { Authorization: `Bearer ${customerToken}` }
    );
    bookingId = checkoutRes.data.booking.id;
  });

  afterAll(async () => {
    await redis.quit();
    await prisma.$disconnect();
  });

  it('should cancel event and all associated bookings with a reason', async () => {
    // Organiser cancels the event
    const cancelRes = await safePost(
      `${API_URL}/organiser/events/${eventId}/cancel`,
      {},
      { Authorization: `Bearer ${organiserToken}` }
    );
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.data.message).toContain('cancelled');

    // Verify event is marked as cancelled in DB
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    expect(event?.isCancelled).toBe(true);

    // Verify the booking is cancelled with the correct reason
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe('CANCELLED');
    expect(booking?.cancellationReason).toBe('Event cancelled by organiser');

    // Verify all show seats are back to AVAILABLE
    const seats = await prisma.showSeat.findMany({ where: { showId } });
    for (const seat of seats) {
      expect(seat.status).toBe('AVAILABLE');
      expect(seat.heldByUserId).toBeNull();
      expect(seat.bookingId).toBeNull();
    }
  });

  it('should not show cancelled event in customer browse list', async () => {
    const eventsRes = await safeGet(`${API_URL}/events`, {
      Authorization: `Bearer ${customerToken}`,
    });
    const eventIds = eventsRes.data.events.map((e: any) => e.id);
    expect(eventIds).not.toContain(eventId);
  });

  it('should reject a second cancellation of an already-cancelled event', async () => {
    try {
      await safePost(
        `${API_URL}/organiser/events/${eventId}/cancel`,
        {},
        { Authorization: `Bearer ${organiserToken}` }
      );
      throw new Error('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('already cancelled');
    }
  });

  it('should return 403 when a customer tries to access the cancel-event endpoint', async () => {
    try {
      await axios.post(
        `${API_URL}/organiser/events/${eventId}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${customerToken}` } }
      );
      throw new Error('Should have thrown');
    } catch (err: any) {
      expect(err.response?.status).toBe(403);
    }
  });
});
