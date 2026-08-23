import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true, // Don't block startup, let it connect asynchronously
  retryStrategy(times) {
    if (times > 3) {
      console.warn(`[Redis] Connection failed after ${times} retries.`);
      return null; // stop retrying
    }
    return Math.min(times * 100, 2000);
  },
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('error', (err) => {
  console.error('[Redis] Error:', err.message);
});
