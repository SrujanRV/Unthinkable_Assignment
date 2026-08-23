import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { prisma } from './services/db.service';
import { redis } from './services/redis.service';

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.io Server
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Set global Socket.io instance on app to use in services/controllers if needed
app.set('io', io);

const startServer = async () => {
  try {
    // Attempt db connection
    console.log('[Boot] Checking database connection...');
    await prisma.$connect();
    console.log('[Boot] Database connected successfully.');

    // Attempt Redis connection
    console.log('[Boot] Connecting to Redis...');
    await redis.connect();

    // Start listening
    server.listen(PORT, () => {
      console.log(`[Boot] Server is running on port ${PORT}`);
      console.log(`[Boot] Health check endpoint: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('[Boot] Server failed to start:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`[Shutdown] Received ${signal}. Starting graceful shutdown...`);

  // Close HTTP Server
  server.close(() => {
    console.log('[Shutdown] HTTP server closed.');
  });

  // Close Prisma connection
  try {
    await prisma.$disconnect();
    console.log('[Shutdown] Prisma disconnected.');
  } catch (error) {
    console.error('[Shutdown] Error disconnecting Prisma:', error);
  }

  // Close Redis connection
  try {
    await redis.quit();
    console.log('[Shutdown] Redis disconnected.');
  } catch (error) {
    console.error('[Shutdown] Error disconnecting Redis:', error);
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
export { io };
