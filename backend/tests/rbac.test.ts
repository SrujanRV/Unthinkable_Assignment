import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';
import { prisma } from '../src/services/db.service';
import { redis } from '../src/services/redis.service';

const API_URL = 'http://localhost:5000/api';

describe('Role-Based Access Control (RBAC) Integration Tests', () => {
  let customerToken: string;
  let organiserToken: string;
  let adminToken: string;
  let showId: string;
  let seatId: string;

  beforeAll(async () => {
    // Register & login Customer
    const emailCust = `rbac_cust_${Date.now()}@test.com`;
    const regCust = await axios.post(`${API_URL}/auth/register`, {
      email: emailCust,
      password: 'password123',
      role: 'CUSTOMER',
    });
    customerToken = regCust.data.token;

    // Register & login Organiser
    const emailOrg = `rbac_org_${Date.now()}@test.com`;
    const regOrg = await axios.post(`${API_URL}/auth/register`, {
      email: emailOrg,
      password: 'password123',
      role: 'ORGANISER',
    });
    organiserToken = regOrg.data.token;

    // Register & login Admin
    const emailAdmin = `rbac_admin_${Date.now()}@test.com`;
    const regAdmin = await axios.post(`${API_URL}/auth/register`, {
      email: emailAdmin,
      password: 'password123',
      role: 'ADMIN',
    });
    adminToken = regAdmin.data.token;

    // Fetch active events to grab a valid showId and seatId
    const eventsRes = await axios.get(`${API_URL}/events`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const events = eventsRes.data.events;
    expect(events.length).toBeGreaterThan(0);
    showId = events[0].shows[0].id;

    // Fetch seat map for this show to get an AVAILABLE seat ID
    const seatsRes = await axios.get(`${API_URL}/shows/${showId}/seats`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const availableSeats = seatsRes.data.seats.filter((s: any) => s.status === 'AVAILABLE');
    expect(availableSeats.length).toBeGreaterThan(0);
    seatId = availableSeats[0].seatId;

    // Clear any potential locks or held status for that seat
    await redis.del(`show:${showId}:seat:${seatId}:hold`);
    await prisma.showSeat.update({
      where: { showId_seatId: { showId, seatId } },
      data: {
        status: 'AVAILABLE',
        heldByUserId: null,
        heldUntil: null,
      },
    });
  });

  // ── 1. Gating Health Endpoint (ADMIN only) ───────────────────────────────
  describe('GET /api/health', () => {
    it('should block CUSTOMER role with 403 Forbidden', async () => {
      try {
        await axios.get(`${API_URL}/health`, {
          headers: { Authorization: `Bearer ${customerToken}` },
        });
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
        expect(err.response.data.error.message).toContain('Forbidden');
      }
    });

    it('should block ORGANISER role with 403 Forbidden', async () => {
      try {
        await axios.get(`${API_URL}/health`, {
          headers: { Authorization: `Bearer ${organiserToken}` },
        });
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
        expect(err.response.data.error.message).toContain('Forbidden');
      }
    });

    it('should allow ADMIN role with 200 OK', async () => {
      const res = await axios.get(`${API_URL}/health`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBeDefined();
      expect(res.data.services).toBeDefined();
    });
  });

  // ── 2. Gating Booking/Hold Endpoints (CUSTOMER only) ──────────────────────
  describe('Seat Hold & Booking Endpoints', () => {
    // POST /shows/:id/hold
    it('should block non-customer (ORGANISER) from holding seats with 403', async () => {
      try {
        await axios.post(
          `${API_URL}/shows/${showId}/hold`,
          { seatIds: [seatId] },
          { headers: { Authorization: `Bearer ${organiserToken}` } }
        );
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
      }
    });

    it('should block non-customer (ADMIN) from holding seats with 403', async () => {
      try {
        await axios.post(
          `${API_URL}/shows/${showId}/hold`,
          { seatIds: [seatId] },
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
      }
    });

    // POST /shows/:id/checkout
    it('should block non-customer (ORGANISER) from checking out with 403', async () => {
      try {
        await axios.post(
          `${API_URL}/shows/${showId}/checkout`,
          { seatIds: [seatId] },
          { headers: { Authorization: `Bearer ${organiserToken}` } }
        );
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
      }
    });

    it('should block non-customer (ADMIN) from checking out with 403', async () => {
      try {
        await axios.post(
          `${API_URL}/shows/${showId}/checkout`,
          { seatIds: [seatId] },
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
      }
    });

    // POST /shows/:id/waitlist
    it('should block non-customer (ORGANISER) from joining waitlist with 403', async () => {
      try {
        await axios.post(
          `${API_URL}/shows/${showId}/waitlist`,
          { seatCategoryId: 'some-category-id' },
          { headers: { Authorization: `Bearer ${organiserToken}` } }
        );
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
      }
    });

    it('should block non-customer (ADMIN) from joining waitlist with 403', async () => {
      try {
        await axios.post(
          `${API_URL}/shows/${showId}/waitlist`,
          { seatCategoryId: 'some-category-id' },
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
      }
    });
  });

  // ── 3. Gating My Bookings (CUSTOMER only) ────────────────────────────────
  describe('GET /api/bookings', () => {
    it('should block non-customer (ORGANISER) with 403', async () => {
      try {
        await axios.get(`${API_URL}/bookings`, {
          headers: { Authorization: `Bearer ${organiserToken}` },
        });
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
      }
    });

    it('should block non-customer (ADMIN) with 403', async () => {
      try {
        await axios.get(`${API_URL}/bookings`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        throw new Error('Access should have been denied');
      } catch (err: any) {
        expect(err.response).toBeDefined();
        expect(err.response.status).toBe(403);
      }
    });

    it('should allow CUSTOMER to list bookings with 200', async () => {
      const res = await axios.get(`${API_URL}/bookings`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.bookings)).toBe(true);
    });
  });
});
