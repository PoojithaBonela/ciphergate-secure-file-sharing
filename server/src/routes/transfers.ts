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
  deleteS3ObjectPermanently,
  MAX_PACKAGE_SIZE_BYTES,
} from '../services/s3Service'
import {
  encryptLocationConfig,
  decryptLocationConfig,
  calculateHaversineDistanceKm,
  generateLocationAuthToken,
  verifyLocationAuthToken,
} from '../services/locationCrypto'
import { consumeAndCleanTransfer } from '../services/cleanupService'
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
  expiryMinutes: z
    .number()
    .int('Expiry minutes must be an integer.')
    .min(1, 'Expiry duration must be at least 1 minute.')
    .max(30 * 24 * 60, 'Expiry duration cannot exceed 30 days.')
    .optional()
    .nullable(),
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
  locationEnabled: z.boolean().default(false),
  cameraCheckEnabled: z.boolean().default(false),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiusKm: z.number().positive().max(500),
      locationName: z.string().trim().max(255).default(''),
    })
    .optional()
    .nullable(),
}).refine(
  (data) => {
    if (data.locationEnabled) {
      return (
        data.location != null &&
        typeof data.location.latitude === 'number' &&
        typeof data.location.longitude === 'number' &&
        typeof data.location.radiusKm === 'number' &&
        data.location.radiusKm > 0
      )
    }
    return true
  },
  {
    message:
      'Valid location configuration (latitude, longitude, radiusKm) is required when Location-Based Access is enabled.',
    path: ['location'],
  },
)

const lookupSchema = z.object({
  sevenWordCode: z
    .string({ required_error: 'Secret code is required.' })
    .trim()
    .regex(
      SEVEN_WORD_REGEX,
      'Secret code must be exactly seven lowercase words separated by single spaces.',
    ),
})

const verifyLocationSchema = z.object({
  transferId: z.string({ required_error: 'transferId is required.' }).trim().min(1),
  latitude: z.number({ required_error: 'latitude is required.' }).min(-90).max(90),
  longitude: z.number({ required_error: 'longitude is required.' }).min(-180).max(180),
})

const authorizeDownloadSchema = z.object({
  transferId: z.string({ required_error: 'transferId is required.' }).trim().min(1),
  authToken: z.string({ required_error: 'authToken is required.' }).trim().min(1),
})

const consumeSchema = z.object({
  transferId: z.string({ required_error: 'transferId is required.' }).trim().min(1),
})

/**
 * POST /api/transfers/register
 * Registers an encrypted package transfer in MongoDB after successful client-side
 * encryption and S3 upload.
 * Stores only the HMAC-SHA-256 fingerprint of the 7-word phrase.
 * If the phrase is already registered, rejects with HTTP 409 and deletes the orphaned S3 object.
 * Strictly calculates UTC expiresAt timestamp on the backend.
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
        expiryMinutes,
        expiresAt,
        locationEnabled,
        location,
        cameraCheckEnabled,
      } = parseResult.data

      s3KeyToCleanOnFailure = s3ObjectKey

      // Calculate HMAC-SHA-256 fingerprint using server secret
      const lookupFingerprint = computeLookupFingerprint(sevenWordCode)

      // Check if code is already registered in active state
      const existing = await Transfer.findOne({ lookupFingerprint }).lean()
      if (existing) {
        // Clean up orphaned S3 object
        await deleteS3ObjectPermanently(s3ObjectKey).catch(() => { })
        res.status(409).json({
          status: 'error',
          message:
            'This secret code is already in use. Please choose a different 7-word secret code.',
        })
        return
      }

      // Encrypt location configuration if enabled
      let encryptedLocationPayload = null
      if (locationEnabled) {
        if (
          !location ||
          typeof location.latitude !== 'number' ||
          typeof location.longitude !== 'number' ||
          !location.radiusKm
        ) {
          await deleteS3ObjectPermanently(s3ObjectKey).catch(() => { })
          res.status(400).json({
            status: 'error',
            message:
              'Location coordinates and radius are required when Location-Based Access is enabled.',
          })
          return
        }

        try {
          encryptedLocationPayload = encryptLocationConfig({
            latitude: location.latitude,
            longitude: location.longitude,
            radiusKm: location.radiusKm,
            locationName: location.locationName || '',
          })
        } catch (encErr) {
          console.error('Failed to encrypt location payload', encErr)
          await deleteS3ObjectPermanently(s3ObjectKey).catch(() => { })
          res.status(500).json({
            status: 'error',
            message: 'Failed to secure location configuration on server.',
          })
          return
        }
      }

      // Calculate expiry timestamp strictly on the backend clock in UTC
      const nowMs = Date.now()
      let calculatedExpiresAt: Date

      if (typeof expiryMinutes === 'number' && expiryMinutes >= 1) {
        // Explicit duration provided by sender
        calculatedExpiresAt = new Date(nowMs + expiryMinutes * 60 * 1000)
      } else if (expiresAt) {
        // Duration derived from sender's custom target time
        const clientTargetMs = new Date(expiresAt).getTime()
        const requestedDurationMs = clientTargetMs - nowMs
        if (requestedDurationMs >= 60 * 1000 && requestedDurationMs <= 30 * 24 * 60 * 60 * 1000) {
          calculatedExpiresAt = new Date(nowMs + requestedDurationMs)
        } else {
          // Default fallback if client timestamp was in the past or exceeded bounds
          calculatedExpiresAt = new Date(nowMs + 24 * 60 * 60 * 1000)
        }
      } else {
        // Default expiry: 24 hours after successful creation
        calculatedExpiresAt = new Date(nowMs + 24 * 60 * 60 * 1000)
      }

      // Create transfer record
      const transfer = new Transfer({
        s3ObjectKey,
        originalFileName,
        mimeType,
        fileSize,
        lookupFingerprint,
        status: 'active',
        expiresAt: calculatedExpiresAt,
        locationEnabled: Boolean(locationEnabled),
        cameraCheckEnabled: Boolean(cameraCheckEnabled),
        encryptedLocation: encryptedLocationPayload,
        cleanupStatus: 'none',
        cleanupAttempts: 0,
      })

      try {
        await transfer.save()
      } catch (dbError: unknown) {
        const mongoErr = dbError as { code?: number; name?: string }
        if (mongoErr.code === 11000) {
          // Unique index constraint triggered
          await deleteS3ObjectPermanently(s3ObjectKey).catch(() => { })
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
        expiresAt: transfer.expiresAt.toISOString(),
        message: 'Transfer registered successfully.',
      })
    } catch (error) {
      if (s3KeyToCleanOnFailure) {
        await deleteS3ObjectPermanently(s3KeyToCleanOnFailure).catch(() => { })
      }
      next(error)
    }
  },
)

/**
 * POST /api/transfers/lookup
 * Identifies exactly one transfer matching the 7-word secret code.
 * Rate-limited by IP.
 * Enforces transfer active status and expiration time strictly.
 * Never issues a presigned download URL for expired or consumed transfers.
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
      })

      if (!transfer) {
        res.status(404).json({
          status: 'error',
          message: 'Transfer not found or has expired.',
        })
        return
      }

      const now = Date.now()
      const isExpiredTime = transfer.expiresAt.getTime() <= now
      const isInactiveStatus = ['expired', 'consumed', 'pending_cleanup', 'deleted'].includes(
        transfer.status,
      )

      // Reject expired or non-active transfers immediately
      if (isExpiredTime || isInactiveStatus) {
        // Transition to expired if not already marked
        if (transfer.status === 'active' || transfer.status === 'uploaded') {
          transfer.status = 'expired'
          transfer.cleanupStatus = 'pending'
          transfer.lookupFingerprint = null // Invalidate lookup fingerprint
          await transfer.save().catch(() => { })
        }

        if (transfer.status === 'consumed') {
          res.status(410).json({
            status: 'error',
            message: 'This transfer has already been accessed and consumed.',
          })
          return
        }

        res.status(410).json({
          status: 'error',
          message: 'This transfer has expired and is no longer available.',
        })
        return
      }

      // Check if location restriction is enabled
      if (transfer.locationEnabled) {
        if (!transfer.encryptedLocation) {
          console.error(
            'Transfer marked locationEnabled but missing encryptedLocation payload:',
            transfer.transferId,
          )
          res.status(500).json({
            status: 'error',
            message: 'Transfer location configuration is corrupted.',
          })
          return
        }

        let radiusKm = 5
        try {
          const locConfig = decryptLocationConfig(transfer.encryptedLocation as any)
          radiusKm = locConfig.radiusKm
        } catch (decryptErr) {
          console.error('Failed to decrypt location metadata in lookup:', decryptErr)
        }

        // Return transfer metadata WITHOUT releasing downloadUrl yet
        res.status(200).json({
          status: 'success',
          locationRequired: true,
          transfer: {
            transferId: transfer.transferId,
            originalFileName: transfer.originalFileName,
            mimeType: transfer.mimeType,
            fileSize: transfer.fileSize,
            createdAt: transfer.createdAt,
            expiresAt: transfer.expiresAt,
            locationRequired: true,
            cameraCheckRequired: Boolean(transfer.cameraCheckEnabled),
            radiusKm,
          },
        })
        return
      }

      // Generate a short-lived presigned GET URL (60 seconds)
      const downloadUrl = await generatePresignedDownloadUrl(transfer.s3ObjectKey)

      res.status(200).json({
        status: 'success',
        locationRequired: false,
        transfer: {
          transferId: transfer.transferId,
          originalFileName: transfer.originalFileName,
          mimeType: transfer.mimeType,
          fileSize: transfer.fileSize,
          createdAt: transfer.createdAt,
          expiresAt: transfer.expiresAt,
          locationRequired: false,
          cameraCheckRequired: Boolean(transfer.cameraCheckEnabled),
          downloadUrl,
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * POST /api/transfers/verify-location
 * Verifies receiver's coordinates against the sender's encrypted location boundary.
 * Rate-limited by IP.
 * Never logs or permanently stores the receiver's coordinates.
 * If within boundary, issues a short-lived signed authorization token and S3 retrieval URL.
 */
transfersRouter.post(
  '/verify-location',
  lookupRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = verifyLocationSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          status: 'error',
          message: parseResult.error.errors[0]?.message ?? 'Invalid coordinate verification payload.',
        })
        return
      }

      const { transferId, latitude, longitude } = parseResult.data

      const transfer = await Transfer.findOne({ transferId })
      if (!transfer) {
        res.status(404).json({
          status: 'error',
          message: 'Transfer not found or has expired.',
        })
        return
      }

      const now = Date.now()
      if (
        transfer.expiresAt.getTime() <= now ||
        ['expired', 'consumed', 'pending_cleanup', 'deleted'].includes(transfer.status)
      ) {
        res.status(410).json({
          status: 'error',
          message: 'This transfer has expired and is no longer available.',
        })
        return
      }

      if (!transfer.locationEnabled) {
        // Unrestricted transfer
        const authToken = generateLocationAuthToken(transfer.transferId)
        const downloadUrl = await generatePresignedDownloadUrl(transfer.s3ObjectKey)
        res.status(200).json({
          status: 'success',
          authorized: true,
          authToken,
          downloadUrl,
          message: 'Location verification not required for this transfer.',
        })
        return
      }

      if (!transfer.encryptedLocation) {
        res.status(500).json({
          status: 'error',
          message: 'Location configuration is corrupted on the server.',
        })
        return
      }

      // Decrypt stored sender location configuration
      const targetConfig = decryptLocationConfig(transfer.encryptedLocation as any)

      // Calculate distance using Haversine formula
      const distanceKm = calculateHaversineDistanceKm(
        latitude,
        longitude,
        targetConfig.latitude,
        targetConfig.longitude,
      )

      if (distanceKm > targetConfig.radiusKm) {
        // Outside allowed radius -> Block access
        res.status(403).json({
          status: 'error',
          code: 'LOCATION_OUT_OF_BOUNDS',
          message: `Access denied. Your current location is outside the permitted boundary for this file transfer (${distanceKm.toFixed(1)} km away; maximum permitted radius is ${targetConfig.radiusKm} km).`,
          distanceKm: Math.round(distanceKm * 10) / 10,
          allowedRadiusKm: targetConfig.radiusKm,
        })
        return
      }

      // Inside allowed radius -> Issue signed authorization token & short-lived retrieval URL
      const authToken = generateLocationAuthToken(transfer.transferId)
      const downloadUrl = await generatePresignedDownloadUrl(transfer.s3ObjectKey)

      res.status(200).json({
        status: 'success',
        authorized: true,
        authToken,
        downloadUrl,
        message: 'Location verified successfully within permitted boundary.',
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * POST /api/transfers/authorize-download
 * Validates a signed authorization token before issuing a presigned S3 retrieval URL.
 */
transfersRouter.post(
  '/authorize-download',
  lookupRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = authorizeDownloadSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid authorization request parameters.',
        })
        return
      }

      const { transferId, authToken } = parseResult.data

      const isValid = verifyLocationAuthToken(transferId, authToken)
      if (!isValid) {
        res.status(401).json({
          status: 'error',
          message: 'Invalid or expired location authorization token. Please verify location again.',
        })
        return
      }

      const transfer = await Transfer.findOne({ transferId })
      if (!transfer) {
        res.status(404).json({
          status: 'error',
          message: 'Transfer not found or has expired.',
        })
        return
      }

      const now = Date.now()
      if (
        transfer.expiresAt.getTime() <= now ||
        ['expired', 'consumed', 'pending_cleanup', 'deleted'].includes(transfer.status)
      ) {
        res.status(410).json({
          status: 'error',
          message: 'This transfer has expired and is no longer available.',
        })
        return
      }

      const downloadUrl = await generatePresignedDownloadUrl(transfer.s3ObjectKey)

      res.status(200).json({
        status: 'success',
        downloadUrl,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * POST /api/transfers/consume
 * Triggered after successful local client-side decryption.
 * Immediately invalidates the transfer and permanently removes the S3 object and metadata.
 * Idempotent: safe against duplicate requests.
 */
transfersRouter.post(
  '/consume',
  lookupRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = consumeSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          status: 'error',
          message: parseResult.error.errors[0]?.message ?? 'Invalid request data.',
        })
        return
      }

      const { transferId } = parseResult.data
      const result = await consumeAndCleanTransfer(transferId)

      res.status(200).json({
        status: 'success',
        message: result.message,
      })
    } catch (error) {
      next(error)
    }
  },
)

export default transfersRouter
