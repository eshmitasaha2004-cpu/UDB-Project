/**
 * Rate Limiter Service — Port 2100
 * Database: Redis (In-Memory Key-Value Store)
 * Why Redis? Ultra-low latency atomic operations (INCR + EXPIRE),
 * perfect for sliding window counters. Sub-millisecond reads.
 * Rate Limit: 5 requests per 60 seconds per IP
 */

const express = require('express');
const app = express();
const PORT = 2100;
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 1000; // 60 seconds

// In-memory Redis simulation (replace with ioredis in production)
const redisStore = new Map();

function redisGet(key) {
  const entry = redisStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    redisStore.delete(key);
    return null;
  }
  return entry;
}

function redisIncr(key, windowMs) {
  const existing = redisGet(key);
  if (!existing) {
    redisStore.set(key, { count: 1, expiry: Date.now() + windowMs, windowStart: Date.now() });
    return { count: 1, ttl: windowMs };
  }
  existing.count++;
  return { count: existing.count, ttl: existing.expiry - Date.now() };
}

// Rate Limiter Middleware
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const key = `rate_limit:${ip}`;

  const { count, ttl } = redisIncr(key, WINDOW_MS);
  const remaining = Math.max(0, RATE_LIMIT - count);
  const resetTime = new Date(Date.now() + ttl).toISOString();

  res.set({
    'X-RateLimit-Limit': RATE_LIMIT,
    'X-RateLimit-Remaining': remaining,
    'X-RateLimit-Reset': resetTime,
    'X-RateLimit-Window': '60s',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset'
  });

  if (count > RATE_LIMIT) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: `Maximum ${RATE_LIMIT} requests per 60 seconds`,
      retryAfter: Math.ceil(ttl / 1000),
      resetAt: resetTime,
      requestCount: count,
      limit: RATE_LIMIT
    });
  }

  next();
}

app.use(express.json());
app.use(rateLimiter);

// Status endpoint - shows rate limit headers
app.get('/status', (req, res) => {
  const ip = req.ip || '127.0.0.1';
  const key = `rate_limit:${ip}`;
  const entry = redisGet(key);
  const used = entry ? entry.count : 0;

  res.json({
    service: 'Rate Limiter',
    database: 'Redis (In-Memory Key-Value)',
    port: PORT,
    config: { limit: RATE_LIMIT, windowSeconds: 60, algorithm: 'Fixed Window Counter' },
    current: {
      ip,
      requestsUsed: used,
      requestsRemaining: Math.max(0, RATE_LIMIT - used),
      windowResetAt: entry ? new Date(entry.expiry).toISOString() : null
    },
    justification: 'Redis chosen for atomic INCR operations, sub-ms latency, and built-in TTL expiry — ideal for distributed rate limiting across multiple API servers'
  });
});

// Sample protected inventory endpoint
app.get('/api/protected', (req, res) => {
  res.json({ message: 'Access granted!', timestamp: new Date().toISOString() });
});

// Debug: view all active rate limit keys
app.get('/debug/keys', (req, res) => {
  const keys = [];
  for (const [k, v] of redisStore.entries()) {
    if (Date.now() <= v.expiry) {
      keys.push({ key: k, count: v.count, ttl: Math.ceil((v.expiry - Date.now()) / 1000) + 's' });
    }
  }
  res.json({ activeKeys: keys.length, keys });
});

app.listen(PORT, () => {
  console.log(`🔴 Rate Limiter Service running on port ${PORT}`);
  console.log(`📊 Limit: ${RATE_LIMIT} req/60s | Database: Redis (simulated)`);
});

module.exports = { app, rateLimiter };
