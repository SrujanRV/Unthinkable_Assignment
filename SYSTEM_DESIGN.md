# System Design & Architecture — Grabaseat

## 1. High-Concurrency Seat Hold & TTL Architecture

Grabaseat uses a hybrid storage model combining **PostgreSQL** for durable ACID state and **Redis** for transient, high-throughput lock coordination.

```
[ Client Browser ]
        │
        ├── 1. POST /api/shows/:id/hold (seatIds[])
        ▼
[ Express API Node ]
        │
        ├── 2. Redis SETNX + EX (Atomic Lock Acquisition) ──► [ Redis Cache ]
        │      (Key: show:{showId}:seat:{seatId}:hold)
        │
        ├── 3. Transactional Update (DB Sync) ─────────────► [ PostgreSQL DB ]
        │      (ShowSeat.status = HELD, heldUntil = NOW + 10m)
        │
        └── 4. Real-time Broadcast ─────────────────────────► [ Socket.io Room ]
               (event: "seatStatusChanged", room: show:{id})
```

1. **State Partitioning**: Permanent entities (Users, Events, Shows, Bookings) reside in PostgreSQL. Active 10-minute seat holds are managed concurrently in Redis using key-value pairs formatted as `show:{showId}:seat:{seatId}:hold`.
2. **Lock TTL Enforcement**: Locks are issued with an explicit Redis Time-To-Live (`EX 600`). If a user abandons checkout, Redis automatically purges the lock key upon expiry without requiring expensive database sweeps for active lock checks.
3. **Durable Sync & Background Sweeping**: PostgreSQL records `heldUntil` timestamps on `ShowSeat` records. A background sweeper process runs every 10 seconds to detect expired `ShowSeat` records whose Redis keys have lapsed, updates their database status back to `AVAILABLE`, and broadcasts `seatStatusChanged` events to connected Socket.io rooms.

---

## 2. Race-Condition-Safe Concurrency Prevention

To guarantee zero double-bookings under peak traffic (e.g., ticket drops with thousands of concurrent requests per second), Grabaseat avoids heavy SQL row locks (`SELECT ... FOR UPDATE`), which can cause database connection pool exhaustion and deadlocks.

### Atomic Multi-Seat Locking (Redis SETNX)

1. **Single-Threaded Execution**: Redis processes commands sequentially on a single thread. Even if microsecond-identical requests hit the API, Redis orders them deterministically.
2. **Atomic Write-and-Validate (`SETNX`)**: For each requested seat, the API executes:
   ```redis
   SET show:{showId}:seat:{seatId}:hold {userId} EX 600 NX
   ```
   - If the key does not exist (`NX`), Redis creates it and returns `OK`.
   - If another user acquired the lock a fraction of a millisecond prior, Redis returns `null`.
3. **All-or-Nothing Transactional Rollback**: Multi-seat reservations (e.g., holding seats A1, A2, A3) require **batch atomicity**. If *any single seat* in a requested array fails to lock:
   - The API immediately executes `redis.del()` for all locks acquired earlier in that request.
   - No DB records are modified.
   - The request fails with HTTP `409 Conflict` containing `conflictingSeatIds`.
   - This prevents partial batch holds and eliminates fragmented lock leaks.

---

## 3. Waitlist Auto-Assignment & FIFO Cascading Flow

When a seat category for a show is completely sold out or fully held, customers can join a category-level queue.

```
[ Seat Released / Booking Cancelled ]
                 │
                 ▼
     [ Check Waitlist Queue ]
   (status: WAITING, order: position ASC)
                 │
      ┌──────────┴──────────┐
      │ Candidate Found     │ No Candidate
      ▼                     ▼
[ Issue 5-Min Offer ]   [ Return Seat to AVAILABLE ]
  - Update status: OFFERED
  - Set offerExpiresAt = NOW + 300s
  - Re-assign Redis lock & ShowSeat to Candidate
  - Dispatch Email with JWT Claim Link
```

1. **Queue Structure**: Waitlist entries (`WaitlistEntry`) are stored with sequential `position` integers per `(showId, seatCategoryId)`.
2. **Event-Driven & Sweeper Cascading**:
   - When a booking is cancelled or an explicit hold is released, the system queries for the next candidate with status `WAITING` ordered by `position ASC`.
   - If a candidate exists, the seat transitions directly from `AVAILABLE` to `HELD` under the candidate's `userId`, bypassing the open market.
3. **Atomic Position Re-indexing**: When a candidate claims their offer or cancels their entry, remaining waitlist positions are preserved deterministically.

---

## 4. Time-Limited Offer Expiration & Claim Authorization

Waitlist offers are strictly time-bound to prevent released seats from being stalled indefinitely by inactive queue candidates.

1. **Offer TTL**: Each waitlist offer is assigned a 5-minute validity window (`OFFER_TTL_SECONDS = 300`).
2. **Cryptographic Claim Tokens**: When an offer is generated, the system signs a stateless, time-limited JWT containing:
   ```json
   {
     "userId": "usr_123",
     "showId": "show_456",
     "seatId": "seat_789",
     "waitlistEntryId": "wl_012",
     "exp": 1756000000
   }
   ```
   The claim URL is emailed to the candidate. Accessing the claim endpoint requires cryptographic verification of the token signature and expiration.
3. **Automated Expiry Sweeping & Cascade**:
   - The background sweeper checks for `WaitlistEntry` records where `status = 'OFFERED'` and `offerExpiresAt < NOW`.
   - Expired entries are marked `EXPIRED`.
   - The system immediately evaluates the next `WAITING` candidate in line and re-assigns the seat offer to them in a single database transaction.
   - If no candidates remain, the seat is returned to `AVAILABLE` status on the public seat map.
