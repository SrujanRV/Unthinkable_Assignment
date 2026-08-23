# Ticket Booking Platform (Movies + Concerts)

A full-stack ticket booking platform built with Node.js, Express, TypeScript, React (Vite), PostgreSQL, Prisma ORM, Redis (for seat holds + TTL), Socket.io (for realtime seat map updates), JWT authentication, Nodemailer/Resend (for email confirmations + QR code tickets), and Vitest (for backend and concurrency tests).

---

## 📁 Repository Structure

```
├── backend/                  # Express API + Prisma ORM + Redis client
│   ├── prisma/               # Database schemas and migrations
│   └── src/                  # API routes, controllers, services, middlewares
├── frontend/                 # React + Vite + TypeScript Client
│   ├── src/                  # Views, Components, Assets, Realtime Socket Client
│   └── tailwind.config.js    # Styling configuration
├── docker-compose.yml        # Local development Postgres and Redis setup
├── .env.example              # Documented environment variables configuration
├── package.json              # Workspace setup and shared monorepo commands
└── README.md                 # Project documentation
```

---

## 🛠️ Tech Stack & Requirements

- **Runtime**: Node.js v20+ / npm v10+
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **In-Memory Cache & Locking**: Redis (seat-hold TTL + atomic concurrency locks)
- **Realtime**: Socket.io
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Mails & QR**: Nodemailer (Ethereal / Resend) + `qrcode` package
- **Linting & Formatting**: ESLint + Prettier

---

## 🚀 Local Development Setup

### 1. Environment Variables Configuration

Copy `.env.example` in the root folder to `.env`:
```bash
cp .env.example .env
```

Review the values:
- `DB_URL`: Points to your PostgreSQL database.
- `REDIS_URL`: Points to your Redis cache.
- `SEAT_HOLD_TTL_SECONDS`: Timeout for seat locks (default 600s).

### 2. Database and Cache (Docker Compose)

Start the local PostgreSQL and Redis servers:
```bash
docker compose up -d
```
This spins up:
- **PostgreSQL** on port `5432` (database `ticket_booking`)
- **Redis** on port `6379`

### 3. Installation

Install dependencies across all workspaces in the monorepo from the root folder:
```bash
npm run install:all
```

### 4. Database Migrations

Generate Prisma Client and apply migrations:
```bash
npm run build --workspace=backend
# Apply DB migrations (requires DB_URL connection)
npm run db:migrate --workspace=backend
```

### 5. Running the Application

To run the backend API and frontend client concurrently:
```bash
npm run dev
```

- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Frontend Client**: [http://localhost:5173](http://localhost:5173)
- **API Health check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🧪 Testing

To run backend test suites (focusing on concurrency safe seat-holds and waitlist offer TTL logic):
```bash
npm run test
```
**Vitest** handles fast in-memory execution of tests using mock dependencies.

---

## 🔑 Authentication Design Decisions

For this application, we implemented a **stateless, access-token-only JWT authentication flow** with a 24-hour expiration window.

### Why we chose this design:
1. **Stateless Scalability**: The primary focus of a high-concurrency ticket platform is throughput and minimizing database overhead. Standard refresh token flows require token verification DB queries, tables, or blacklists. Keeping JWTs stateless allows our Express middleware to quickly authorize users by unpacking the cryptographic signature in memory without adding database read bottlenecks.
2. **Simplified Test Harnesses**: In integration testing and concurrency stress tests, token expirations can complicate assertions. A 24-hour access token window keeps tokens stable for the lifecycle of our local developer sessions and test suites.
3. **Roles in Claims**: The user's role (`CUSTOMER`, `ORGANISER`, or `ADMIN`) is embedded inside the JWT token claims. The backend can instantly restrict or grant route access using role-based claims in the request pipeline.

---

## 🛡️ Role-Based Access Control (RBAC)

To secure user actions and protect system resources, we enforce strict role-based access control (RBAC). The backend route guards serve as the single source of truth, while the frontend hides UI elements matching unauthorized views.

### Permissions Matrix

| Feature / Action | API Endpoint | CUSTOMER | ORGANISER | ADMIN |
| :--- | :--- | :---: | :---: | :---: |
| Browse events & shows | `GET /api/events`, `GET /api/shows/:id` | ✅ | ✅ | ✅ |
| View seat maps & availability | `GET /api/shows/:id/seats` | ✅ | ✅ | ✅ |
| Hold seats (10-min lock) | `POST /api/shows/:id/hold` | ✅ | ❌ (403) | ❌ (403) |
| Release held seats | `POST /api/shows/:id/release` | ✅ | ❌ (403) | ❌ (403) |
| Checkout & confirm booking | `POST /api/shows/:id/checkout` | ✅ | ❌ (403) | ❌ (403) |
| Join waitlist for sold-out seats | `POST /api/shows/:id/waitlist` | ✅ | ❌ (403) | ❌ (403) |
| View personal booking history | `GET /api/bookings` | ✅ | ❌ (403) | ❌ (403) |
| Cancel booking & release seats | `POST /api/bookings/:id/cancel` | ✅ | ❌ (403) | ❌ (403) |
| Access Organiser Dashboard & Sales Metrics | `GET /api/organiser/*` | ❌ (403) | ✅ | ❌ (403) |
| Manage Venues & Seat Layouts | `POST /api/admin/*` | ❌ (403) | ❌ (403) | ✅ |
| View System Health Metrics | `GET /api/health` | ❌ (403) | ❌ (403) | ✅ |

---


## 🔒 Concurrency-Safe Seat Holds (System Design)

To ensure that two simultaneous customers racing to select and reserve the exact same seat never both succeed, we chose **Redis-based Distributed Locking with TTL** using the atomic `SETNX` (Set if Not Exists) operation.

### Why Redis SETNX over Postgres SELECT ... FOR UPDATE?
1. **Single-threaded Event Loop**: Redis executes incoming operations sequentially on a single thread. This ensures that even if two requests arrive at the exact same microsecond, Redis processes one first, guaranteeing order of execution.
2. **Atomic Write-and-Check**: The command `SET show:{showId}:seat:{seatId}:hold {userId} EX {ttl} NX` combines validation and writing into a single CPU instruction at the cache layer. 
   - If the seat is free, it locks it for the user and returns `OK`.
   - If the seat is already held, the command immediately returns `null` (fails), refusing to modify the state.
3. **High Throughput & Database Isolation**: Under high concurrency (e.g., concert ticket drops), database lock operations like `SELECT ... FOR UPDATE` on Postgres can degrade performance and lead to deadlocks or database connection pool exhaustion. Offloading active lock contention to Redis keeps the database light and scales to thousands of concurrent requests per second. While `SELECT ... FOR UPDATE` is a reliable choice for strictly SQL-only transactional safety, using Redis as the high-throughput lock engine ensures we do not block heavy transactional operations on Postgres.
4. **All-or-Nothing Hold Atomicity**: When a user selects multiple seats (e.g., A1, A2, A3) and submits them in a single hold request, the backend attempts to lock each seat in Redis sequentially. If *any* of the seats fail to lock (because it's already held by another user), the backend rolls back all successfully acquired locks in that batch (by deleting the keys) and fails the request with a `409 Conflict` status containing the `conflictingSeatIds`. This guarantees all-or-nothing atomicity.
5. **Background Expiry Sweeper**: Redis handles lock expiration natively using `EX` (TTL). To keep PostgreSQL durable states in sync, a background cron sweeps PostgreSQL `ShowSeat` records whose `heldUntil` timestamp has passed, double-checks if the lock has expired in Redis, releases the SQL record if so, and broadcasts a Socket.io `seatStatusUpdate` to notify all browsing clients of the seat release in real-time.