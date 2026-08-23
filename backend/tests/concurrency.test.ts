import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';
import { prisma } from '../src/services/db.service';
import { redis } from '../src/services/redis.service';

const API_URL = 'http://localhost:5000/api';
const SWEEP_INTERVAL_MS = 10000;

describe('Seat Hold Flow - Integration Tests', () => {
  let userAToken: string;
  let userBToken: string;
  let showId: string;
  let seatId: string;

  beforeAll(async () => {
    const emailA = `hold_a_${Date.now()}@test.com`;
    const regA = await axios.post(`${API_URL}/auth/register`, { email: emailA, password: 'password123', role: 'CUSTOMER' });
    userAToken = regA.data.token;

    const emailB = `hold_b_${Date.now()}@test.com`;
    const regB = await axios.post(`${API_URL}/auth/register`, { email: emailB, password: 'password123', role: 'CUSTOMER' });
    userBToken = regB.data.token;

    const eventsRes = await axios.get(`${API_URL}/events`, { headers: { Authorization: `Bearer ${userAToken}` } });
    const events = eventsRes.data.events;
    expect(events.length).toBeGreaterThan(0);
    showId = events[0].shows[0].id;

    const seatsRes = await axios.get(`${API_URL}/shows/${showId}/seats`, { headers: { Authorization: `Bearer ${userAToken}` } });
    const available = seatsRes.data.seats.filter((s: any) => s.status === 'AVAILABLE');
    expect(available.length).toBeGreaterThanOrEqual(1);
    seatId = available[0].seatId;

    await redis.del(`show:${showId}:seat:${seatId}:hold`);
    await prisma.showSeat.update({
      where: { showId_seatId: { showId, seatId } },
      data: { status: 'AVAILABLE', heldByUserId: null, heldUntil: null },
    });
  });

  it('concurrent batch hold - exactly one succeeds, other gets 409 with conflictingSeatIds', async () => {
    const reqA = axios.post(`${API_URL}/shows/${showId}/hold`, { seatIds: [seatId] }, { headers: { Authorization: `Bearer ${userAToken}` } });
    const reqB = axios.post(`${API_URL}/shows/${showId}/hold`, { seatIds: [seatId] }, { headers: { Authorization: `Bearer ${userBToken}` } });

    const results = await Promise.allSettled([reqA, reqB]);

    let successCount = 0;
    let failureCount = 0;
    let winnerToken = '';

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        successCount++;
        expect(res.value.status).toBe(200);
        expect(res.value.data.heldUntil).toBeDefined();
        winnerToken = idx === 0 ? userAToken : userBToken;
      } else {
        failureCount++;
        const err = res.reason;
        expect(err.response.status).toBe(409);
        const { conflictingSeatIds } = err.response.data.error;
        expect(Array.isArray(conflictingSeatIds)).toBe(true);
        expect(conflictingSeatIds).toContain(seatId);
        expect(err.response.data.error.message).toBeTruthy();
      }
    });

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    if (winnerToken) {
      await axios.post(`${API_URL}/shows/${showId}/release`, { seatIds: [seatId] }, { headers: { Authorization: `Bearer ${winnerToken}` } });
    }
  });

  it('sweep releases an expired hold - seat becomes AVAILABLE', async () => {
    await redis.del(`show:${showId}:seat:${seatId}:hold`);
    await prisma.showSeat.update({
      where: { showId_seatId: { showId, seatId } },
      data: { status: 'AVAILABLE', heldByUserId: null, heldUntil: null },
    });

    const holdRes = await axios.post(`${API_URL}/shows/${showId}/hold`, { seatIds: [seatId] }, { headers: { Authorization: `Bearer ${userAToken}` } });
    expect(holdRes.status).toBe(200);

    // Simulate TTL expiry: backdate Postgres heldUntil and delete Redis key
    await prisma.showSeat.update({
      where: { showId_seatId: { showId, seatId } },
      data: { heldUntil: new Date(Date.now() - 5000) },
    });
    await redis.del(`show:${showId}:seat:${seatId}:hold`);

    // Wait for sweep to run
    await new Promise((resolve) => setTimeout(resolve, SWEEP_INTERVAL_MS + 3000));

    const seatsRes = await axios.get(`${API_URL}/shows/${showId}/seats`, { headers: { Authorization: `Bearer ${userAToken}` } });
    const seat = seatsRes.data.seats.find((s: any) => s.seatId === seatId);
    expect(seat).toBeDefined();
    expect(seat.status).toBe('AVAILABLE');
  }, 30000);

  it('explicit cancel releases hold immediately without waiting for TTL', async () => {
    await redis.del(`show:${showId}:seat:${seatId}:hold`);
    await prisma.showSeat.update({
      where: { showId_seatId: { showId, seatId } },
      data: { status: 'AVAILABLE', heldByUserId: null, heldUntil: null },
    });

    const holdRes = await axios.post(`${API_URL}/shows/${showId}/hold`, { seatIds: [seatId] }, { headers: { Authorization: `Bearer ${userAToken}` } });
    expect(holdRes.status).toBe(200);

    const releaseRes = await axios.post(`${API_URL}/shows/${showId}/release`, { seatIds: [seatId] }, { headers: { Authorization: `Bearer ${userAToken}` } });
    expect(releaseRes.status).toBe(200);

    const seatsRes = await axios.get(`${API_URL}/shows/${showId}/seats`, { headers: { Authorization: `Bearer ${userAToken}` } });
    const seat = seatsRes.data.seats.find((s: any) => s.seatId === seatId);
    expect(seat).toBeDefined();
    expect(seat.status).toBe('AVAILABLE');

    const redisVal = await redis.get(`show:${showId}:seat:${seatId}:hold`);
    expect(redisVal).toBeNull();
  });
});
