import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { Transfer } from '../models/Transfer'
import {
  SEVEN_WORD_REGEX,
  isValidSevenWordCode,
  computeLookupFingerprint,
} from '../services/phraseCrypto'
import {
  generatePresignedDownloadUrl,
  deleteS3Object,
  MAX_PACKAGE_SIZE_BYTES,
} from '../services/s3Service'
import { lookupRateLimiter } from '../middleware/rateLimiter'
import { HttpError } from '../middleware/errorHandler'

const transfersRouter = Router()

const registerSchema = z.object({
  sevenWordCode: z
    .string({ required_error: 'Secret code is required.' })
    .trim()
    .regex(
      SEVEN_WORD_REGEX,
      'Secret code must be exactly seven lowercase words separated by single spaces.',
    ),
  s3ObjectKey: z
    .string({ required_error: 'S3 object key is required.' })
    .regex(/^encra-[a-f0-9-]+\.encra$/, 'Invalid S3 object key format.'),
  originalFileName: z
    .string({ required_error: 'Original filename is required.' })
    .trim()
    .min(1, 'Original filename cannot be empty.')
    .max(255, 'Original filename is too long.'),
  mimeType: z
    .string()
    .trim()
    .max(128)
    .default('application/octet-stream'),
  fileSize: z
    .number({ required_error: 'File size is required.' })
    .int('File size must be an integer.')
    .positive('File size must be greater than 0.')
    .max(MAX_PACKAGE_SIZE_BYTES, 'File size exceeds maximum permitted limit.'),
  expiresAt: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true
        const parsed = Date.parse(val)
        return !isNaN(parsed)
      },
      { message: 'Invalid expiry date format.' },
    ),
})

const lookupSchema = z.object({
  sevenWordCode: z
    .string({ required_error: 'Secret code is required.' })
    .trim()
    .regex(
      SEVEN_WORD_REGEX,
      'Secret code must be exactly seven lowercase words separated by single spaces.',
    ),
})

/**
 * POST /api/transfers/register
 * Registers an encrypted package transfer in MongoDB after successful client-side
 * encryption and S3 upload.
 * Stores only the HMAC-SHA-256 fingerprint of the 7-word phrase.
 * If the phrase is already registered, rejects with HTTP 409 and deletes the orphaned S3 object.
 */
transfersRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let s3KeyToCleanOnFailure: string | null = null

    try {
      const parseResult = registerSchema.safeParse(req.body)
      if (!parseResult.success) {
        throw new HttpError(
          400,
          parseResult.error.errors[0]?.message ?? 'Invalid registration request data.',
          parseResult.error.errors,
        )
      }

      const {
        sevenWordCode,
        s3ObjectKey,
        originalFileName,
        mimeType,
        fileSize,
        expiresAt,
      } = parseResult.data

      s3KeyToCleanOnFailure = s3ObjectKey

      // Calculate HMAC-SHA-256 fingerprint using server secret
      const lookupFingerprint = computeLookupFingerprint(sevenWordCode)

      // Check if code is already registered in active state
      const existing = await Transfer.findOne({ lookupFingerprint }).lean()
      if (existing) {
        // Clean up orphaned S3 object
        await deleteS3Object(s3ObjectKey)
        res.status(409).json({
          status: 'error',
          message:
            'This secret code is already in use. Please choose a different 7-word secret code.',
        })
        return
      }

      // Create transfer record
      const transfer = new Transfer({
        s3ObjectKey,
        originalFileName,
        mimeType,
        fileSize,
        lookupFingerprint,
        status: 'uploaded',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })

      try {
        await transfer.save()
      } catch (dbError: unknown) {
        const mongoErr = dbError as { code?: number; name?: string }
        if (mongoErr.code === 11000) {
          // Unique index constraint triggered
          await deleteS3Object(s3ObjectKey)
          res.status(409).json({
            status: 'error',
            message:
              'This secret code is already in use. Please choose a different 7-word secret code.',
          })
          return
        }
        throw dbError
      }

      res.status(201).json({
        status: 'success',
        transferId: transfer.transferId,
        message: 'Transfer registered successfully.',
      })
    } catch (error) {
      if (s3KeyToCleanOnFailure) {
        await deleteS3Object(s3KeyToCleanOnFailure).catch(() => {})
      }
      next(error)
    }
  },
)

/**
 * POST /api/transfers/lookup
 * Identifies exactly one transfer matching the 7-word secret code.
 * Rate-limited by IP.
 * Returns only permitted metadata and a short-lived presigned GET URL for downloading the .encra package.
 */
transfersRouter.post(
  '/lookup',
  lookupRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = lookupSchema.safeParse(req.body)
      if (!parseResult.success) {
        // Generic failure response — do not reveal details
        res.status(400).json({
          status: 'error',
          message:
            'Invalid secret code format. Must be exactly seven lowercase words separated by single spaces.',
        })
        return
      }

      const { sevenWordCode } = parseResult.data

      if (!isValidSevenWordCode(sevenWordCode)) {
        res.status(404).json({
          status: 'error',
          message: 'Transfer not found or has expired.',
        })
        return
      }

      const lookupFingerprint = computeLookupFingerprint(sevenWordCode)

      const transfer = await Transfer.findOne({
        lookupFingerprint,
        status: 'uploaded',
      })

      if (!transfer) {
        res.status(404).json({
          status: 'error',
          message: 'Transfer not found or has expired.',
        })
        return
      }

      // Check expiry if configured
      if (transfer.expiresAt && transfer.expiresAt.getTime() < Date.now()) {
        transfer.status = 'expired'
        await transfer.save().catch(() => {})

        res.status(404).json({
          status: 'error',
          message: 'Transfer not found or has expired.',
        })
        return
      }

      // Generate a short-lived presigned GET URL (60 seconds)
      const downloadUrl = await generatePresignedDownloadUrl(transfer.s3ObjectKey)

      res.status(200).json({
        status: 'success',
        transfer: {
          transferId: transfer.transferId,
          originalFileName: transfer.originalFileName,
          mimeType: transfer.mimeType,
          fileSize: transfer.fileSize,
          createdAt: transfer.createdAt,
          expiresAt: transfer.expiresAt,
          downloadUrl,
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

export default transfersRouter
