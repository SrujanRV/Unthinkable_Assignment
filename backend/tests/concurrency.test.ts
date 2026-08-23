import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

describe('Seat Hold Concurrency Integration Test', () => {
  let userAToken: string;
  let userBToken: string;
  let showId: string;
  let seatId: string;

  beforeAll(async () => {
    // 1. Register and login User A
    const emailA = `concurrent_a_${Date.now()}@test.com`;
    const regARes = await axios.post(`${API_URL}/auth/register`, {
      email: emailA,
      password: 'password123',
      role: 'CUSTOMER',
    });
    userAToken = regARes.data.token;

    // 2. Register and login User B
    const emailB = `concurrent_b_${Date.now()}@test.com`;
    const regBRes = await axios.post(`${API_URL}/auth/register`, {
      email: emailB,
      password: 'password123',
      role: 'CUSTOMER',
    });
    userBToken = regBRes.data.token;

    // 3. Fetch active events to grab a valid showId and seatId
    const eventsRes = await axios.get(`${API_URL}/events`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    
    const events = eventsRes.data.events;
    expect(events.length).toBeGreaterThan(0);
    
    // Grab the first show of the first event
    const activeShow = events[0].shows[0];
    expect(activeShow).toBeDefined();
    showId = activeShow.id;

    // Fetch seat map for this show to get an AVAILABLE seat ID
    const seatsRes = await axios.get(`${API_URL}/shows/${showId}/seats`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    
    const availableSeats = seatsRes.data.seats.filter((s: any) => s.status === 'AVAILABLE');
    expect(availableSeats.length).toBeGreaterThan(0);
    seatId = availableSeats[0].seatId;
  });

  it('should allow exactly one concurrent hold request to succeed and reject the other', async () => {
    // Set up concurrent axios requests
    const requestA = axios.post(
      `${API_URL}/shows/${showId}/hold`,
      { seatIds: [seatId] },
      { headers: { Authorization: `Bearer ${userAToken}` } }
    );

    const requestB = axios.post(
      `${API_URL}/shows/${showId}/hold`,
      { seatIds: [seatId] },
      { headers: { Authorization: `Bearer ${userBToken}` } }
    );

    // Run them concurrently using Promise.allSettled
    const results = await Promise.allSettled([requestA, requestB]);

    let successCount = 0;
    let failureCount = 0;
    let successUserToken = '';

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        successCount++;
        expect(res.value.status).toBe(200);
        successUserToken = idx === 0 ? userAToken : userBToken;
      } else {
        failureCount++;
        // Assert it failed with 400 Bad Request
        const error = res.reason;
        expect(error.response).toBeDefined();
        expect(error.response.status).toBe(400);
        expect(error.response.data.error.message).toContain('already held');
      }
    });

    // CRITICAL ASSERTION: Exactly one request must succeed and exactly one must fail!
    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    // CLEANUP: Release the held seat so the database remains clean for other operations
    if (successUserToken) {
      await axios.post(
        `${API_URL}/shows/${showId}/release`,
        { seatIds: [seatId] },
        { headers: { Authorization: `Bearer ${successUserToken}` } }
      );
    }
  });
});
