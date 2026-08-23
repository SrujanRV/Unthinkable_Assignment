import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { io as ioClient, Socket } from 'socket.io-client';
import { prisma } from '../src/services/db.service';
import { redis } from '../src/services/redis.service';

const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

// Helper to prevent Axios error serialization issues in Vitest workers
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

describe('Socket.io Real-Time Broadcast Integration Tests', () => {
  let token: string;
  let userId: string;
  let showId: string;
  let seatId: string;
  let clientSocket: Socket;

  beforeAll(async () => {
    // 1. Create a user
    const email = `socket_test_${Date.now()}@test.com`;
    const regRes = await safePost(`${API_URL}/auth/register`, {
      email,
      password: 'password123',
      role: 'CUSTOMER',
    });
    token = regRes.data.token;
    userId = regRes.data.user.id;

    // 2. Fetch an active show and an available seat
    const eventsRes = await safeGet(`${API_URL}/events`, { Authorization: `Bearer ${token}` });
    const events = eventsRes.data.events;
    expect(events.length).toBeGreaterThan(0);
    showId = events[0].shows[0].id;

    const seatsRes = await safeGet(`${API_URL}/shows/${showId}/seats`, { Authorization: `Bearer ${token}` });
    const availableSeats = seatsRes.data.seats.filter((s: any) => s.status === 'AVAILABLE');
    expect(availableSeats.length).toBeGreaterThan(0);
    seatId = availableSeats[availableSeats.length - 1].seatId;

    // Clear any leftover hold/lock
    await redis.del(`show:${showId}:seat:${seatId}:hold`);
    await prisma.showSeat.updateMany({
      where: { showId, seatId },
      data: { status: 'AVAILABLE', heldByUserId: null, heldUntil: null, bookingId: null },
    });
  });

  afterAll(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    // Cleanup hold and booking
    await redis.del(`show:${showId}:seat:${seatId}:hold`);
    const bookingIds = (await prisma.showSeat.findMany({
      where: { showId, seatId },
      select: { bookingId: true },
    })).map(x => x.bookingId).filter(Boolean) as string[];
    
    await prisma.showSeat.updateMany({
      where: { showId, seatId },
      data: { status: 'AVAILABLE', heldByUserId: null, heldUntil: null, bookingId: null },
    });
    if (bookingIds.length > 0) {
      await prisma.booking.deleteMany({
        where: { id: { in: bookingIds } },
      });
    }
  });

  const waitForEvent = (socket: Socket, eventName: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, 5000);

      socket.once(eventName, (data: any) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  };

  it('should broadcast seatStatusChanged with HELD, AVAILABLE, and BOOKED statuses', async () => {
    // 1. Establish socket connection
    clientSocket = ioClient(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('joinShow', showId);
        resolve();
      });
      clientSocket.on('connect_error', (err) => reject(new Error(err.message)));
    });

    // 2. Transition 1: Hold the seat (AVAILABLE -> HELD)
    const holdPromise = waitForEvent(clientSocket, 'seatStatusChanged');
    
    await safePost(
      `${API_URL}/shows/${showId}/hold`,
      { seatIds: [seatId] },
      { Authorization: `Bearer ${token}` }
    );

    const holdData = await holdPromise;
    expect(holdData.seatId).toBe(seatId);
    expect(holdData.status).toBe('HELD');
    expect(holdData.heldByUserId).toBe(userId);

    // 3. Transition 2: Release the held seat (HELD -> AVAILABLE)
    const releasePromise = waitForEvent(clientSocket, 'seatStatusChanged');

    await safePost(
      `${API_URL}/shows/${showId}/release`,
      { seatIds: [seatId] },
      { Authorization: `Bearer ${token}` }
    );

    const releaseData = await releasePromise;
    expect(releaseData.seatId).toBe(seatId);
    expect(releaseData.status).toBe('AVAILABLE');
    expect(releaseData.heldByUserId).toBeNull();

    // 4. Transition 3: Hold again, then Book/Checkout (HELD -> BOOKED)
    const holdPromise2 = waitForEvent(clientSocket, 'seatStatusChanged');
    await safePost(
      `${API_URL}/shows/${showId}/hold`,
      { seatIds: [seatId] },
      { Authorization: `Bearer ${token}` }
    );
    await holdPromise2;

    const bookPromise = waitForEvent(clientSocket, 'seatStatusChanged');
    await safePost(
      `${API_URL}/shows/${showId}/checkout`,
      { seatIds: [seatId] },
      { Authorization: `Bearer ${token}` }
    );

    const bookData = await bookPromise;
    expect(bookData.seatId).toBe(seatId);
    expect(bookData.status).toBe('BOOKED');
    expect(bookData.heldByUserId).toBeNull();
  });
});
