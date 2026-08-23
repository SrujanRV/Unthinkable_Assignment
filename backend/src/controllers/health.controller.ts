import { Request, Response } from 'express';
import { prisma } from '../services/db.service';
import { redis } from '../services/redis.service';

export const checkHealth = async (req: Request, res: Response): Promise<void> => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';
  let isHealthy = true;

  // Probe database
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (error) {
    console.error('[Health Check] Database probe failed:', error);
    isHealthy = false;
  }

  // Probe redis
  try {
    // If not connected, try to connect
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const pong = await redis.ping();
    if (pong === 'PONG') {
      redisStatus = 'connected';
    }
  } catch (error) {
    console.error('[Health Check] Redis probe failed:', error);
    isHealthy = false;
  }

  const responseStatus = isHealthy ? 200 : 503;
  res.status(responseStatus).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  });
};
