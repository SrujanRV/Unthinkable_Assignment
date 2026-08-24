# 🎟️ Grabaseat — High-Concurrency Ticket Booking Platform

> 🌐 **Live Application**: [https://grabaseat.vercel.app](https://grabaseat.vercel.app)  
> ⚡ **Backend API Server**: [https://grabaseat-backend.onrender.com](https://grabaseat-backend.onrender.com)  
> 🏥 **Health & Status Ping**: [https://grabaseat-backend.onrender.com/api/health](https://grabaseat-backend.onrender.com/api/health)

Grabaseat is a high-concurrency ticket booking platform designed for movies and live concerts. It features real-time seat status synchronization, race-condition-safe seat holds using Redis distributed locks with Time-To-Live (TTL), an automated FIFO waitlist queue with cascading offers, and automated QR code entry ticket generation.

---

## 📁 Repository Structure

```
├── backend/                  # Express API + Prisma ORM + Redis + Socket.io Server
│   ├── prisma/               # Database schema, migrations, and realistic seed script
│   │   ├── migrations/       # SQL migration history
│   │   └── seed.ts           # Curated seed dataset (venues, events, shows, seats)
│   ├── src/                  # Source code
│   │   ├── controllers/      # Route logic (auth, shows, bookings, organiser, admin, waitlist)
│   │   ├── middlewares/      # JWT auth and RBAC role verification
│   │   ├── routes/           # Express router endpoints
│   │   ├── services/         # DB (Prisma), Redis, Email (Nodemailer), Hold Sweeper
│   │   ├── app.ts            # Express application configuration
│   │   └── index.ts          # Server entry point + Socket.io server
│   └── tests/                # Vitest integration & concurrency test suites
├── frontend/                 # React + Vite + TypeScript Single Page Application
│   ├── src/
│   │   ├── components/       # UI components (BrowseEvents, SeatMap, MyBookings, OrganiserPanel, etc.)
│   │   ├── context/          # Auth & Global Hold state context
│   │   ├── App.tsx           # Main shell, navigation, dark mode, global hold banner
│   │   └── main.tsx          # React entry point
│   ├── tailwind.config.js    # Tailwind styling with dark mode support
│   └── vite.config.ts        # Vite dev server + WebSocket/API reverse proxy
├── docker-compose.yml        # PostgreSQL 15 & Redis 7 container orchestration
├── .env.example              # Documented environment variable template
├── SYSTEM_DESIGN.md          # Architectural deep-dive into concurrency & TTL mechanisms
├── package.json              # Monorepo workspace configuration
└── README.md                 # Project setup and documentation
```

---

## 🛠️ Tech Stack & Prerequisites

### Technology Stack
- **Backend Runtime**: Node.js (v20+) with Express.js & TypeScript
- **Database**: PostgreSQL 15+ managed via Prisma ORM
- **Cache & Distributed Locking**: Redis 7+ (for seat hold TTLs & atomic lock acquisition)
- **Real-Time Layer**: Socket.io 4+ (live seat map updates across connected viewers)
- **Frontend Client**: React 18 + Vite + TypeScript + Tailwind CSS (with persistent Dark Mode)
- **Email & QR Codes**: Nodemailer (Ethereal test accounts / SMTP) + `qrcode` SVG/PNG generation
- **Testing**: Vitest for backend integration & stress concurrency tests

### Prerequisites
Ensure you have the following installed on your machine:
- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Docker Desktop** (optional, recommended for database and cache orchestration)

---

## 🔑 Environment Variables (`.env.example`)

Copy `.env.example` to create your local `.env` configuration:
```bash
cp .env.example .env
```

| Key | Default Value | Description |
| :--- | :--- | :--- |
| `DB_URL` | `postgresql://postgres:postgres@localhost:5432/ticket_booking?schema=public` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `JWT_SECRET` | `super-secret-jwt-signing-key-change-in-production` | Secret key for signing stateless authentication JWTs |
| `SEAT_HOLD_TTL_SECONDS` | `600` | Seat hold lock timeout in seconds (default: 10 minutes) |
| `OFFER_TTL_SECONDS` | `300` | Waitlist offer claim timeout in seconds (default: 5 minutes) |
| `EMAIL_API_KEY` | `re_123456789` | Email service API key (optional for Resend integration) |
| `EMAIL_FROM` | `tickets@yourdomain.com` | Default sender email address |
| `PORT` | `5000` | Backend Express server port |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend application URL for CORS and email links |
| `BACKEND_URL` | `http://localhost:5000` | Backend API base URL |

---

### 👤 Pre-Seeded Test Credentials

| Role | Email Address | Password | Purpose |
| :--- | :--- | :--- | :--- |
| **Customer 1** | `customer@test.com` | `password123` | Primary customer account for seat holds & booking |
| **Customer 2** | `customer2@test.com` | `password123` | Secondary customer account for multi-browser concurrency testing |
| **Organiser** | `organiser@test.com` | `password123` | Event hosting, event cancellation, sales metrics |
| **Admin** | `admin@test.com` | `password123` | System health diagnostic dashboard & venue management |

---

## 🚀 Setup & Execution Guide

### Option 1: Local Setup with Docker Compose (Recommended)

1. **Clone the repository and install workspace dependencies**:
   ```bash
   git clone https://github.com/SrujanRV/Unthinkable_Assignment.git
   cd Unthinkable_Assignment
   npm run install:all
   ```

2. **Start Infrastructure Services (PostgreSQL & Redis)**:
   ```bash
   docker compose up -d
   ```
   *Spins up PostgreSQL on port `5432` and Redis on port `6379`.*

3. **Run Database Migrations & Seed Data**:
   ```bash
   # Run Prisma migrations
   npx prisma migrate dev --schema=backend/prisma/schema.prisma

   # Seed curated sample events, venues, showtimes, and seat layouts
   npx prisma db seed --schema=backend/prisma/schema.prisma
   ```

4. **Start Development Servers**:
   ```bash
   npm run dev
   ```
   - **Frontend App**: [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:5000](http://localhost:5000)
   - **Health Endpoint**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

### Option 2: Full Docker Execution

If you prefer running the entire application (Frontend, Backend, PostgreSQL, and Redis) in containerized environments:

1. **Build and start all services via Docker Compose**:
   ```bash
   docker compose -f docker-compose.full.yml up --build -d
   ```
2. **Apply DB migrations inside the backend container**:
   ```bash
   docker compose exec backend npx prisma migrate deploy
   docker compose exec backend npx prisma db seed
   ```

---

## 🧪 Running Integration & Concurrency Tests

Backend tests cover role-based permissions, waitlist cascading, seat cancellation, and concurrent seat hold contention:

```bash
# Run all Vitest integration tests sequentially
cd backend
npx vitest run --no-file-parallelism
```

---

## 🗄️ Database Schema & Architecture

```mermaid
erDiagram
    USER ||--o{ BOOKING : places
    USER ||--o{ EVENT : organises
    USER ||--o{ SHOW_SEAT : holds
    USER ||--o{ WAITLIST_ENTRY : joins
    
    VENUE ||--o{ SEAT_CATEGORY : contains
    VENUE ||--o{ SEAT : contains
    VENUE ||--o{ SHOW : hosts
    
    SEAT_CATEGORY ||--o{ SEAT : defines
    SEAT_CATEGORY ||--o{ SHOW_PRICE : prices
    SEAT_CATEGORY ||--o{ WAITLIST_ENTRY : queues
    
    EVENT ||--o{ SHOW : schedules
    
    SHOW ||--o{ SHOW_PRICE : specifies
    SHOW ||--o{ SHOW_SEAT : includes
    SHOW ||--o{ BOOKING : generates
    SHOW ||--o{ WAITLIST_ENTRY : tracks
    
    SEAT ||--o{ SHOW_SEAT : maps
    
    BOOKING ||--o{ SHOW_SEAT : reserves
```

### Table Descriptions

- **`User`**: System accounts storing email, password hash, and role (`CUSTOMER`, `ORGANISER`, `ADMIN`).
- **`Venue`**: Performance locations with name, address, and seating capacity.
- **`SeatCategory`**: Pricing tiers within a venue (e.g. *VIP*, *Premium*, *Standard*) with multiplier rates.
- **`Seat`**: Physical seat definitions bound to a venue, category, row identifier (e.g. `"A"`), and number (`1`).
- **`Event`**: High-level event catalog items (movies/concerts) managed by organisers. Supports `isCancelled` flag.
- **`Show`**: Specific scheduled showtimes for an event at a venue.
- **`ShowPrice`**: Explicit pricing per category for a specific showtime.
- **`ShowSeat`**: Specific seat instance for a showtime. Tracks status (`AVAILABLE`, `HELD`, `BOOKED`), `heldByUserId`, and `heldUntil`.
- **`Booking`**: Customer transaction record storing `bookingReference`, `totalAmount`, `status` (`CONFIRMED`, `CANCELLED`), and `cancellationReason`.
- **`WaitlistEntry`**: Queue entry for sold-out seat categories. Tracks `position`, `status` (`WAITING`, `OFFERED`, `CLAIMED`, `EXPIRED`), and `offerExpiresAt`.

---

## 📡 Complete API Reference

All endpoints requiring authentication expect a standard `Authorization: Bearer <JWT_TOKEN>` header.

### 1. Authentication Endpoints

#### `POST /api/auth/register`
- **Auth**: Public
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "secretpassword",
    "role": "CUSTOMER"
  }
  ```
  *(Role can be `CUSTOMER` or `ORGANISER`)*
- **Response** (`201 Created`):
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": { "id": "usr_123", "email": "user@example.com", "role": "CUSTOMER" }
  }
  ```

#### `POST /api/auth/login`
- **Auth**: Public
- **Request Body**:
  ```json
  { "email": "user@example.com", "password": "secretpassword" }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": { "id": "usr_123", "email": "user@example.com", "role": "CUSTOMER" }
  }
  ```

#### `GET /api/auth/me`
- **Auth**: Required (`CUSTOMER`, `ORGANISER`, `ADMIN`)
- **Response** (`200 OK`):
  ```json
  { "user": { "id": "usr_123", "email": "user@example.com", "role": "CUSTOMER" } }
  ```

---

### 2. Events & Showtimes (Browse Directory)

#### `GET /api/events`
- **Auth**: Required (`CUSTOMER`, `ORGANISER`, `ADMIN`)
- **Query Parameters**: `type` (optional: `MOVIE` \| `CONCERT`), `search` (optional keyword)
- **Response** (`200 OK`): Returns list of active, non-cancelled events with venue and upcoming showtimes.

#### `GET /api/shows/:showId`
- **Auth**: Required (`CUSTOMER`, `ORGANISER`, `ADMIN`)
- **Response** (`200 OK`): Detailed show object including event metadata, venue details, and category pricing (`showPrices`).

#### `GET /api/shows/:showId/seats`
- **Auth**: Required (`CUSTOMER`, `ORGANISER`, `ADMIN`)
- **Response** (`200 OK`):
  ```json
  {
    "seats": [
      {
        "id": "ss_123",
        "seatId": "seat_456",
        "row": "A",
        "number": 1,
        "categoryId": "cat_789",
        "categoryName": "VIP",
        "status": "AVAILABLE",
        "heldByUserId": null,
        "heldUntil": null
      }
    ]
  }
  ```

---

### 3. Seat Holds & Checkout Flow

#### `POST /api/shows/:showId/hold`
- **Auth**: Required (`CUSTOMER` only)
- **Request Body**:
  ```json
  { "seatIds": ["seat_456", "seat_457"] }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "message": "Seats held successfully",
    "heldUntil": "2026-08-24T06:40:00.000Z"
  }
  ```
- **Error** (`409 Conflict`): Returned if any seat in the batch is held/booked by another user:
  ```json
  {
    "error": {
      "message": "1 seat(s) in your selection were just taken by another user.",
      "conflictingSeatIds": ["seat_456"],
      "status": 409
    }
  }
  ```

#### `POST /api/shows/:showId/release`
- **Auth**: Required (`CUSTOMER` only)
- **Request Body**:
  ```json
  { "seatIds": ["seat_456"] }
  ```
- **Response** (`200 OK`): `{ "message": "Seats released successfully" }`

#### `POST /api/shows/:showId/checkout`
- **Auth**: Required (`CUSTOMER` only)
- **Request Body**:
  ```json
  { "seatIds": ["seat_456", "seat_457"] }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "booking": {
      "id": "bkg_789",
      "bookingReference": "GB-8F92A1",
      "totalPrice": 75.00,
      "seats": ["A1", "A2"],
      "emailPreviewUrl": "https://ethereal.email/message/...",
      "qrCodeDataUrl": "data:image/png;base64,..."
    }
  }
  ```

---

### 4. Bookings & User History

#### `GET /api/bookings`
- **Auth**: Required (`CUSTOMER` only)
- **Response** (`200 OK`): Returns customer's booking history with show details, seat numbers, cancellation status, and cancellation reasons.

#### `POST /api/bookings/:id/cancel`
- **Auth**: Required (`CUSTOMER` only)
- **Response** (`200 OK`): Cancels the booking, releases all associated seats, sets `cancellationReason = "Cancelled by customer"`, and updates live seat maps.

---

### 5. Waitlist & Priority Queue

#### `POST /api/shows/:showId/waitlist`
- **Auth**: Required (`CUSTOMER` only)
- **Request Body**:
  ```json
  { "seatCategoryId": "cat_789" }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "message": "Successfully joined the waitlist",
    "waitlistEntry": { "id": "wl_123", "position": 1, "status": "WAITING" }
  }
  ```

#### `GET /api/shows/:showId/waitlist/claim`
- **Auth**: Required (`CUSTOMER` only)
- **Query Parameter**: `token` (signed claim JWT)
- **Response** (`200 OK`): Converts waitlist offer to confirmed hold and returns hold details.

---

### 6. Organiser Management

#### `POST /api/organiser/events`
- **Auth**: Required (`ORGANISER` only)
- **Request Body**: Event title, description, type (`MOVIE` \| `CONCERT`), showtimes array, and category pricing.

#### `POST /api/organiser/events/:id/cancel`
- **Auth**: Required (`ORGANISER` only)
- **Response** (`200 OK`): Marks event as cancelled, cancels all associated confirmed bookings, releases all held seats, sets `cancellationReason = "Event cancelled by organiser"`, dispatches refund notification emails to affected customers, and broadcasts real-time seat updates.

#### `GET /api/organiser/metrics`
- **Auth**: Required (`ORGANISER` only)
- **Response** (`200 OK`): Returns sales summaries, active bookings count, total revenue generated, and seat occupancy percentages across organiser's events.

---

### 7. Administration & Health

#### `GET /api/venues`
- **Auth**: Required (`ADMIN` or `ORGANISER`)
- **Response** (`200 OK`): List of available venue layouts and seat configurations.

#### `POST /api/admin/venues`
- **Auth**: Required (`ADMIN` only)
- **Request Body**: Venue name, location, and seat layout matrix.

#### `GET /api/health`
- **Auth**: Required (`ADMIN` only)
- **Response** (`200 OK`): System diagnostic metrics (PostgreSQL status, Redis ping, active connections, node uptime).

---

## 🔒 Deep Dive: Seat Hold TTL & Waitlist Logic

For a detailed technical architectural write-up on race-safety, Redis atomic `SETNX` locking, batch atomicity, and waitlist offer cascading, see **[SYSTEM_DESIGN.md](file:///c:/Users/sruja/Desktop/Unthinkable_Assignment/SYSTEM_DESIGN.md)**.

---

## 🌐 Production Deployment Guide (Render + Vercel)

### Live Deployment URLs & Checkpoints

| Service | Platform | Target URL / Configuration |
| :--- | :--- | :--- |
| **Frontend Web App** | Vercel | `https://grabaseat.vercel.app` *(Replace with your Vercel URL)* |
| **Backend API Server** | Render (Web Service) | `https://grabaseat-backend.onrender.com` *(Replace with your Render URL)* |
| **Database** | Render (PostgreSQL) | Managed PostgreSQL Database |
| **Cache & Lock Store** | Render / Upstash | Managed Redis Instance |
| **24/7 Keep-Alive Cron** | GitHub Actions / cron-job.org | `https://grabaseat-backend.onrender.com/api/health` (Pings every 10m) |

---

### Step-by-Step Deployment Instructions

#### Step 1: Deploy Database & Redis on Render
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Create a **PostgreSQL Database**:
   - **Name**: `grabaseat-db`
   - **Database Name**: `ticket_booking`
   - Copy the **Internal Database URL** (`postgresql://...`).
3. Create a **Redis Instance** (Render Key-Value or Upstash Redis):
   - Copy the `redis://...` Connection String.

#### Step 2: Deploy Backend Web Service on Render
1. Click **New +** -> **Web Service** on Render and select your GitHub repository.
2. Configure settings:
   - **Name**: `grabaseat-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx prisma migrate deploy && npm start`
3. Add **Environment Variables** in Render Dashboard:
   - `DB_URL`: `<Your-Render-PostgreSQL-Internal-URL>`
   - `REDIS_URL`: `<Your-Redis-Connection-String>`
   - `JWT_SECRET`: `<Secure-Random-Secret-Key>`
   - `SEAT_HOLD_TTL_SECONDS`: `600`
   - `OFFER_TTL_SECONDS`: `300`
   - `FRONTEND_URL`: `https://grabaseat.vercel.app`
   - `BACKEND_URL`: `https://grabaseat-backend.onrender.com`
4. Click **Deploy Web Service**.

#### Step 3: Seed Production Database
Once the backend service is live on Render:
```bash
# Seed initial sample events, venues, showtimes, and seat layouts
npx prisma db seed --schema=backend/prisma/schema.prisma
```
*(Alternatively, run `npx prisma db seed` directly inside Render Web Shell)*

#### Step 4: Deploy Frontend Client on Vercel
1. Log in to [Vercel Dashboard](https://vercel.com/) and click **Add New** -> **Project**.
2. Import your GitHub repository `Unthinkable_Assignment`.
3. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
4. Environment Variables:
   - `VITE_API_URL`: `https://grabaseat-backend.onrender.com`
5. Click **Deploy**. Vercel will build and serve your SPA at `https://<your-project>.vercel.app`.

#### Step 5: Prevent Render Free Tier Sleep (10-Minute Health Ping)
Render free tier web services automatically spin down after 15 minutes of inactivity. To keep Grabaseat awake and instantly responsive 24/7:
1. **GitHub Actions Workflow (Pre-Configured)**:
   - A ready-to-use workflow is included at `.github/workflows/keep-alive.yml` which automatically pings `https://grabaseat-backend.onrender.com/api/health` every 10 minutes (`*/10 * * * *`).
2. **Alternative: External Cron Service**:
   - Register a free account on [cron-job.org](https://cron-job.org).
   - Create a cron job pointing to `https://grabaseat-backend.onrender.com/api/health`.
   - Set Schedule: **Every 10 minutes**.