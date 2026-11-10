import { Request, Response, NextFunction } from 'express'

interface RateLimitRecord {
  timestamps: number[]
}

export interface RateLimitOptions {
  windowMs: number
  max: number
  message?: string
}

/**
 * In-memory rate limiting middleware factory.
 * Each created limiter maintains its own isolated attempt tracking map.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = 'Too many requests. Please try again later.' } = options
  const attempts = new Map<string, RateLimitRecord>()

  // Clean up stale records periodically
  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [ip, record] of attempts.entries()) {
      record.timestamps = record.timestamps.filter((t) => t > cutoff)
      if (record.timestamps.length === 0) {
        attempts.delete(ip)
      }
    }
  }, 5 * 60 * 1000)

  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref()
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract client IP safely
    const forwarded = req.headers?.['x-forwarded-for']
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : null) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown-ip'

    const isLoopback =
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip === 'localhost' ||
      ip === 'unknown-ip'

    // Allow generous limit on localhost/loopback in non-production environments
    const effectiveMax =
      process.env.NODE_ENV !== 'production' && isLoopback ? Math.max(max * 10, 100) : max

    const now = Date.now()
    const cutoff = now - windowMs

    let record = attempts.get(ip)
    if (!record) {
      record = { timestamps: [] }
      attempts.set(ip, record)
    }

    // Keep only timestamps within window
    record.timestamps = record.timestamps.filter((t) => t > cutoff)

    if (record.timestamps.length >= effectiveMax) {
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
 * Max 20 attempts per minute per IP.
 */
export const lookupRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many lookup attempts. Please wait a minute and try again.',
})

/**
 * Rate limiter specifically for receiver OTP attempts.
 * Max 20 attempts per minute per IP.
 */
export const otpRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many OTP attempts. Please wait a minute and try again.',
})

/**
 * Rate limiter specifically for receiver location verification attempts.
 * Max 30 attempts per minute per IP.
 */
export const locationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many location verification attempts. Please wait a minute and try again.',
})

/**
 * Generous rate limiter for transfer consumption and post-authorization requests.
 * Max 60 attempts per minute per IP.
 */
export const generalTransferRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many requests. Please try again in a moment.',
})
