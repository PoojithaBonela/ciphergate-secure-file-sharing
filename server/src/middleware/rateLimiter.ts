import { Request, Response, NextFunction } from 'express'

interface RateLimitRecord {
  timestamps: number[]
}

const lookupAttempts = new Map<string, RateLimitRecord>()

// Clean up stale records every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60000
  for (const [ip, record] of lookupAttempts.entries()) {
    record.timestamps = record.timestamps.filter((t) => t > cutoff)
    if (record.timestamps.length === 0) {
      lookupAttempts.delete(ip)
    }
  }
}, 5 * 60 * 1000).unref()

export interface RateLimitOptions {
  windowMs: number
  max: number
  message?: string
}

/**
 * In-memory rate limiting middleware.
 * Tracks attempts by client IP within the configured time window.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = 'Too many requests. Please try again later.' } = options

  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract client IP safely
    const forwarded = req.headers?.['x-forwarded-for']
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : null) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown-ip'

    const now = Date.now()
    const cutoff = now - windowMs

    let record = lookupAttempts.get(ip)
    if (!record) {
      record = { timestamps: [] }
      lookupAttempts.set(ip, record)
    }

    // Keep only timestamps within window
    record.timestamps = record.timestamps.filter((t) => t > cutoff)

    if (record.timestamps.length >= max) {
      const oldestInWindow = record.timestamps[0] ?? now
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000))

      res.setHeader?.('Retry-After', retryAfterSeconds)
      res.status(429).json({
        status: 'error',
        message,
        retryAfter: retryAfterSeconds,
      })
      return
    }

    record.timestamps.push(now)
    next()
  }
}

/**
 * Rate limiter specifically for secret code lookup attempts.
 * Max 10 attempts per minute per IP.
 */
export const lookupRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many lookup attempts. Please wait a minute and try again.',
})
