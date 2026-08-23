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