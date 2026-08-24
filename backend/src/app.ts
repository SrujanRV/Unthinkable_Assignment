import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import organiserRoutes from './routes/organiser.routes';
import generalRoutes from './routes/general.routes';
import showRoutes from './routes/show.routes';
import bookingRoutes from './routes/booking.routes';
import { errorHandler } from './middlewares/error.middleware';

// Load environment variables
dotenv.config();

const app: Express = express();

// Configure middlewares
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root landing endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Grabaseat Backend API Server',
    status: 'online',
    version: '1.0.0',
    documentation: 'https://github.com/SrujanRV/Unthinkable_Assignment',
    healthCheck: '/api/health',
    endpoints: {
      health: 'GET /api/health',
      events: 'GET /api/events',
      venues: 'GET /api/venues',
      auth: 'POST /api/auth/login, POST /api/auth/register',
    },
  });
});

// Register routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/organiser', organiserRoutes);
app.use('/api/shows', showRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api', generalRoutes);

// Catch-all 404
app.use((req, res, next) => {
  const error: any = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Register global error handler
app.use(errorHandler);

export default app;
