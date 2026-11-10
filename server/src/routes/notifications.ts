import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { SenderVerification } from '../models/SenderVerification'
import {
  generateSecureOtp,
  hashSenderOtp,
  verifySenderOtpHmac,
  generateSenderVerificationToken,
  sendBrevoSenderOtpEmail,
  maskEmail,
} from '../services/otpService'
import { createRateLimiter } from '../middleware/rateLimiter'

const notificationsRouter = Router()

// Rate limiter: max 6 OTP requests per minute per IP
const notificationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 6,
  message: 'Too many verification attempts. Please wait a minute and try again.',
})

const emailSchema = z.object({
  email: z
    .string({ required_error: 'Sender email address is required.' })
    .trim()
    .email('Please enter a valid email address.')
    .max(255, 'Email address is too long.'),
})

const verifyOtpSchema = z.object({
  email: z
    .string({ required_error: 'Sender email address is required.' })
    .trim()
    .email('Please enter a valid email address.'),
  otp: z
    .string({ required_error: 'Verification code is required.' })
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be exactly 6 digits.'),
})

/**
 * POST /api/notifications/send-otp
 * Dispatches a 6-digit OTP to the sender's email address for access notifications.
 * Enforces a 60-second cooldown between requests.
 */
notificationsRouter.post(
  '/send-otp',
  notificationRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = emailSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          status: 'error',
          message: parseResult.error.errors[0]?.message ?? 'Invalid email address.',
        })
        return
      }

      const email = parseResult.data.email.toLowerCase()
      const now = Date.now()

      // Check existing verification state for resend cooldown
      const existing = await SenderVerification.findOne({ email })
      if (existing && existing.lastSentAt) {
        const elapsedMs = now - existing.lastSentAt.getTime()
        if (elapsedMs < 60 * 1000) {
          const remainingSec = Math.ceil((60 * 1000 - elapsedMs) / 1000)
          res.status(429).json({
            status: 'error',
            message: `Please wait ${remainingSec} seconds before requesting a new verification code.`,
            retryAfterSeconds: remainingSec,
          })
          return
        }
      }

      // Generate cryptographically secure 6-digit OTP
      const otp = generateSecureOtp()
      const hashed = hashSenderOtp(email, otp)
      const expiresAt = new Date(now + 60 * 1000) // strictly 60 seconds

      // Store only HMAC hash in MongoDB with reset attempts and fresh expiry
      await SenderVerification.findOneAndUpdate(
        { email },
        {
          $set: {
            hash: hashed,
            expiresAt,
            attempts: 0,
            lastSentAt: new Date(now),
            verified: false,
            verificationToken: null,
          },
        },
        { upsert: true, new: true },
      )

      // Dispatch OTP email via Brevo transactional email HTTP API
      const emailResult = await sendBrevoSenderOtpEmail(email, otp)
      if (!emailResult.success) {
        console.warn('[notifications] Brevo email failed:', emailResult.error)
      }

      res.status(200).json({
        status: 'success',
        maskedEmail: maskEmail(email),
        message: `Verification code sent to ${maskEmail(email)}.`,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * POST /api/notifications/verify-otp
 * Validates the 6-digit OTP entered by the sender.
 * Enforces attempt limits (max 5) and strict 60-second expiration.
 * Upon success: marks verified and issues a cryptographic verification token.
 */
notificationsRouter.post(
  '/verify-otp',
  notificationRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = verifyOtpSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          status: 'error',
          message: parseResult.error.errors[0]?.message ?? 'Invalid verification payload.',
        })
        return
      }

      const { email: rawEmail, otp } = parseResult.data
      const email = rawEmail.toLowerCase()
      const now = Date.now()

      const record = await SenderVerification.findOne({ email })
      if (!record || !record.hash) {
        res.status(400).json({
          status: 'error',
          message: 'No active verification session found. Please request a new code.',
        })
        return
      }

      // Check attempt limits (max 5)
      if (record.attempts >= 5) {
        res.status(429).json({
          status: 'error',
          message: 'Maximum verification attempts exceeded. Please request a new code.',
        })
        return
      }

      // Check expiry (strictly 60 seconds)
      if (now > record.expiresAt.getTime()) {
        res.status(410).json({
          status: 'error',
          message: 'Verification code has expired. Please request a new code.',
        })
        return
      }

      // Verify HMAC hash in constant time
      const isMatch = verifySenderOtpHmac(email, otp, record.hash)
      if (!isMatch) {
        record.attempts += 1
        await record.save()
        const remaining = Math.max(0, 5 - record.attempts)
        res.status(401).json({
          status: 'error',
          message: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          attemptsRemaining: remaining,
        })
        return
      }

      // Verification successful: issue cryptographic token
      const verificationToken = generateSenderVerificationToken(email)
      record.verified = true
      record.verifiedAt = new Date(now)
      record.verificationToken = verificationToken
      record.hash = '' // Clear hash to prevent replay
      await record.save()

      res.status(200).json({
        status: 'success',
        verified: true,
        verificationToken,
        message: 'Sender email verified successfully.',
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * POST /api/notifications/resend-otp
 * Resends a fresh 6-digit OTP to the sender's email address.
 * Enforces a 60-second cooldown from lastSentAt.
 */
notificationsRouter.post(
  '/resend-otp',
  notificationRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = emailSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          status: 'error',
          message: parseResult.error.errors[0]?.message ?? 'Invalid email address.',
        })
        return
      }

      const email = parseResult.data.email.toLowerCase()
      const now = Date.now()

      const existing = await SenderVerification.findOne({ email })
      if (!existing) {
        res.status(404).json({
          status: 'error',
          message: 'No verification record found. Please initiate verification first.',
        })
        return
      }

      // Enforce 60-second cooldown
      if (existing.lastSentAt) {
        const elapsedMs = now - existing.lastSentAt.getTime()
        if (elapsedMs < 60 * 1000) {
          const remainingSec = Math.ceil((60 * 1000 - elapsedMs) / 1000)
          res.status(429).json({
            status: 'error',
            message: `Please wait ${remainingSec} seconds before requesting a new verification code.`,
            retryAfterSeconds: remainingSec,
          })
          return
        }
      }

      // Generate new 6-digit OTP
      const otp = generateSecureOtp()
      const hashed = hashSenderOtp(email, otp)
      const expiresAt = new Date(now + 60 * 1000)

      existing.hash = hashed
      existing.expiresAt = expiresAt
      existing.attempts = 0
      existing.lastSentAt = new Date(now)
      existing.verified = false
      existing.verificationToken = null
      await existing.save()

      await sendBrevoSenderOtpEmail(email, otp)

      res.status(200).json({
        status: 'success',
        maskedEmail: maskEmail(email),
        message: `A new verification code has been dispatched to ${maskEmail(email)}.`,
      })
    } catch (error) {
      next(error)
    }
  },
)

export default notificationsRouter

