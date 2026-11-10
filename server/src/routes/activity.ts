import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { Transfer } from '../models/Transfer'
import { ActivitySession } from '../models/ActivitySession'
import { decryptRecipientEmail } from '../services/otpService'
import { decryptLocationConfig } from '../services/locationCrypto'
import {
  generateMagicLinkToken,
  sendEmailOneDecryptionInProgress,
  sendEmailTwoDecryptionCompleted,
} from '../services/notificationEmailService'
import { s3Client } from '../services/s3Service'
import { config } from '../config/env'

const activityRouter = Router()

// In-memory map of active magic link raw tokens keyed by transferId
// This allows Email Two to reuse the exact same magic link raw token when the session ends
const activeRawTokens = new Map<string, string>()

/**
 * POST /api/activity/start
 * Called when recipient completes authentication checks and opens the secure file viewer.
 */
activityRouter.post(
  '/start',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const startSchema = z.object({
        transferId: z.string().min(1),
        deviceInfo: z
          .object({
            deviceType: z.string().default('Desktop'),
            os: z.string().default('Unknown'),
            browser: z.string().default('Unknown'),
            browserVersion: z.string().default('Unknown'),
            screenResolution: z.string().optional(),
            userAgent: z.string().optional(),
          })
          .default({
            deviceType: 'Desktop',
            os: 'Unknown',
            browser: 'Unknown',
            browserVersion: 'Unknown',
          }),
        authResults: z
          .object({
            secretCode: z.boolean().default(true),
            password: z.boolean().default(true),
            recipientOtp: z.boolean().default(false),
            locationCheck: z.boolean().default(false),
            cameraCheck: z.boolean().default(false),
          })
          .default({
            secretCode: true,
            password: true,
            recipientOtp: false,
            locationCheck: false,
            cameraCheck: false,
          }),
        locationInfo: z
          .object({
            receiverCoordinates: z
              .object({
                latitude: z.number(),
                longitude: z.number(),
              })
              .optional()
              .nullable(),
            distanceKm: z.number().optional().nullable(),
            verificationResult: z.enum(['passed', 'failed', 'disabled']).default('disabled'),
          })
          .optional()
          .nullable(),
      })

      const parseResult = startSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({ status: 'error', message: 'Invalid session start payload.' })
        return
      }

      const { transferId, deviceInfo, authResults, locationInfo } = parseResult.data

      const transfer = await Transfer.findOne({ transferId })
      if (!transfer) {
        res.status(404).json({ status: 'error', message: 'Transfer not found.' })
        return
      }

      // Check if session already exists for this transfer
      let session = await ActivitySession.findOne({ transferId })

      // Generate magic link token for dashboard authentication
      const { rawToken, tokenHash } = generateMagicLinkToken()
      activeRawTokens.set(transferId, rawToken)

      // Decrypt location config if enabled on transfer to store permitted location info
      let permittedLocationName: string | null = null
      let permittedRadiusKm: number | null = null

      if (transfer.locationEnabled && transfer.encryptedLocation) {
        try {
          const decryptedLoc = decryptLocationConfig(transfer.encryptedLocation as any)
          permittedLocationName = decryptedLoc.locationName || null
          permittedRadiusKm = decryptedLoc.radiusKm
        } catch {
          // Non-fatal
        }
      }

      const now = new Date()
      const magicExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours

      if (!session) {
        session = new ActivitySession({
          transferId,
          magicLinkTokenHash: tokenHash,
          magicLinkExpiresAt: magicExpiresAt,
          sessionStatus: 'in_progress',
          startedAt: now,
          deviceInfo: {
            ...deviceInfo,
            sessionStartTimestamp: now,
          },
          locationInfo: {
            enabled: transfer.locationEnabled,
            permittedLocationName,
            permittedRadiusKm,
            receiverCoordinates: locationInfo?.receiverCoordinates || null,
            distanceKm: locationInfo?.distanceKm ?? null,
            verificationResult: locationInfo?.verificationResult ?? (transfer.locationEnabled ? 'passed' : 'disabled'),
            verifiedAt: transfer.locationEnabled ? now : null,
          },
          authResults: {
            secretCode: { verified: authResults.secretCode, timestamp: now },
            password: { verified: authResults.password, timestamp: now },
            recipientOtp: {
              enabled: transfer.verifiedAccessEnabled,
              verified: authResults.recipientOtp,
              timestamp: transfer.verifiedAccessEnabled ? now : null,
            },
            locationCheck: {
              enabled: transfer.locationEnabled,
              verified: authResults.locationCheck,
              timestamp: transfer.locationEnabled ? now : null,
            },
            cameraCheck: {
              enabled: transfer.cameraCheckEnabled,
              verified: authResults.cameraCheck,
              timestamp: transfer.cameraCheckEnabled ? now : null,
            },
          },
          securityEvents: [
            {
              type: 'session_started',
              title: 'Viewing Session Started',
              description: 'Recipient successfully passed required authentication checks and opened the document viewer.',
              timestamp: now,
              details: {
                transferId,
                originalFileName: transfer.originalFileName,
                deviceType: deviceInfo.deviceType,
                os: deviceInfo.os,
                browser: `${deviceInfo.browser} ${deviceInfo.browserVersion}`.trim(),
              },
            },
          ],
        })
      } else {
        session.sessionStatus = 'in_progress'
        session.magicLinkTokenHash = tokenHash
        session.magicLinkExpiresAt = magicExpiresAt
        session.startedAt = now
      }

      // Check if Notifications are enabled on the transfer
      if (transfer.notificationsEnabled && transfer.encryptedSenderEmail) {
        try {
          const senderEmail = decryptRecipientEmail(transfer.encryptedSenderEmail as any)
          if (senderEmail && !session.emailOneSentAt) {
            const sendResult = await sendEmailOneDecryptionInProgress(senderEmail, rawToken)
            if (sendResult.success) {
              session.emailOneSentAt = new Date()
              session.securityEvents.push({
                id: randomUUID(),
                type: 'notification_sent',
                title: 'Sender Notification Email 1 Sent',
                description: `Live activity dashboard link dispatched to verified sender email (${senderEmail}).`,
                timestamp: new Date(),
                details: { type: 'email_one' },
              })
            }
          }
        } catch (emailErr) {
          console.error('[activity/start] Error sending Email One:', emailErr)
        }
      }

      await session.save()

      res.status(200).json({
        status: 'success',
        sessionId: session._id,
        transferId: session.transferId,
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/activity/snapshot
 * Securely uploads the receiver camera check snapshot to S3 in receiver-snapshots/
 */
activityRouter.post(
  '/snapshot',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const snapshotSchema = z.object({
        transferId: z.string().min(1),
        imageBase64: z.string().min(10), // data:image/jpeg;base64,... or raw base64
      })

      const parseResult = snapshotSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({ status: 'error', message: 'Invalid snapshot data.' })
        return
      }

      const { transferId, imageBase64 } = parseResult.data

      const transfer = await Transfer.findOne({ transferId })
      if (!transfer) {
        res.status(404).json({ status: 'error', message: 'Transfer not found.' })
        return
      }

      // Strip data URI prefix if present
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
      const imageBuffer = Buffer.from(base64Data, 'base64')

      if (imageBuffer.length === 0 || imageBuffer.length > 5 * 1024 * 1024) {
        res.status(400).json({ status: 'error', message: 'Invalid snapshot file size (must be < 5MB).' })
        return
      }

      const snapshotKey = `receiver-snapshots/snapshot-${transferId.replace(/[^a-zA-Z0-9_-]/g, '')}-${randomUUID()}.jpg`

      // Upload directly to private S3 bucket with server-side encryption
      const putCommand = new PutObjectCommand({
        Bucket: config.aws.bucket,
        Key: snapshotKey,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
        ServerSideEncryption: 'AES256',
      })

      await s3Client.send(putCommand)

      const capturedAt = new Date()

      // Update ActivitySession
      let session = await ActivitySession.findOne({ transferId })
      if (!session) {
        const { rawToken, tokenHash } = generateMagicLinkToken()
        activeRawTokens.set(transferId, rawToken)
        session = new ActivitySession({
          transferId,
          magicLinkTokenHash: tokenHash,
          magicLinkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sessionStatus: 'in_progress',
          startedAt: capturedAt,
          receiverSnapshot: {
            s3Key: snapshotKey,
            capturedAt,
          },
        })
      } else {
        session.receiverSnapshot = {
          s3Key: snapshotKey,
          capturedAt,
        }
      }

      session.securityEvents.push({
        id: randomUUID(),
        type: 'camera_snapshot_captured',
        title: 'Receiver Snapshot Captured',
        description: 'Camera check verified receiver identity and captured verification snapshot stored securely in private AWS S3.',
        timestamp: capturedAt,
        details: { s3Key: snapshotKey, sizeBytes: imageBuffer.length },
      })

      await session.save()

      res.status(200).json({
        status: 'success',
        snapshotKey,
        capturedAt: capturedAt.toISOString(),
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/activity/event
 * Records real-time security events (warnings, tab switch, gaze, face detections).
 */
activityRouter.post(
  '/event',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventSchema = z.object({
        transferId: z.string().min(1),
        type: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        details: z.record(z.unknown()).optional().default({}),
      })

      const parseResult = eventSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({ status: 'error', message: 'Invalid event data.' })
        return
      }

      const { transferId, type, title, description, details } = parseResult.data

      const session = await ActivitySession.findOne({ transferId })
      if (!session) {
        // Return 200 silently so client doesn't break if session hasn't started yet
        res.status(200).json({ status: 'ignored', message: 'Session not initialized.' })
        return
      }

      const now = new Date()
      session.securityEvents.push({
        id: randomUUID(),
        type,
        title,
        description,
        timestamp: now,
        details,
      })

      // If it's a termination event, reflect in status
      if (type.includes('termination')) {
        session.sessionStatus = 'terminated'
        session.outcome = title
        session.terminationReason = description
        if (!session.endedAt) {
          session.endedAt = now
          const duration = Math.round((now.getTime() - session.startedAt.getTime()) / 1000)
          session.durationSeconds = duration > 0 ? duration : 1
        }
      }

      await session.save()

      res.status(200).json({ status: 'success' })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/activity/end
 * Finalizes the viewing session and dispatches Email Two to verified sender.
 */
activityRouter.post(
  '/end',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const endSchema = z.object({
        transferId: z.string().min(1),
        outcome: z.string().optional().default('Decryption completed'),
        terminationReason: z.string().optional().nullable(),
        durationSeconds: z.number().optional().nullable(),
      })

      const parseResult = endSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({ status: 'error', message: 'Invalid end payload.' })
        return
      }

      const { transferId, outcome, terminationReason, durationSeconds } = parseResult.data

      const session = await ActivitySession.findOne({ transferId })
      if (!session) {
        res.status(404).json({ status: 'error', message: 'Session not found.' })
        return
      }

      const now = new Date()
      session.endedAt = now
      const calculatedDuration =
        durationSeconds ?? Math.round((now.getTime() - session.startedAt.getTime()) / 1000)
      session.durationSeconds = calculatedDuration > 0 ? calculatedDuration : 1

      if (terminationReason) {
        session.sessionStatus = 'terminated'
        session.outcome = outcome || 'Viewing session terminated'
        session.terminationReason = terminationReason
      } else if (session.sessionStatus !== 'revoked') {
        session.sessionStatus = 'completed'
        session.outcome = outcome || 'Viewing session completed successfully'
      }

      session.securityEvents.push({
        id: randomUUID(),
        type: 'session_ended',
        title: terminationReason ? 'Session Terminated' : 'Viewing Session Ended',
        description: terminationReason
          ? `Session terminated: ${terminationReason}`
          : 'Recipient closed the secure document viewer. Active viewing session finalized.',
        timestamp: now,
        details: {
          durationSeconds: session.durationSeconds,
          outcome: session.outcome,
          terminationReason,
        },
      })

      // Send Email Two if notifications enabled and not yet sent
      const transfer = await Transfer.findOne({ transferId })
      if (
        transfer &&
        transfer.notificationsEnabled &&
        transfer.encryptedSenderEmail &&
        !session.emailTwoSentAt
      ) {
        try {
          const senderEmail = decryptRecipientEmail(transfer.encryptedSenderEmail as any)
          const rawToken = activeRawTokens.get(transferId)

          if (senderEmail && rawToken) {
            const sendResult = await sendEmailTwoDecryptionCompleted(senderEmail, rawToken)
            if (sendResult.success) {
              session.emailTwoSentAt = new Date()
              session.securityEvents.push({
                id: randomUUID(),
                type: 'notification_sent',
                title: 'Sender Notification Email 2 Sent',
                description: `Final activity report link dispatched to verified sender email (${senderEmail}).`,
                timestamp: new Date(),
                details: { type: 'email_two' },
              })
            }
          }
        } catch (emailErr) {
          console.error('[activity/end] Error sending Email Two:', emailErr)
        }
      }

      await session.save()

      res.status(200).json({
        status: 'success',
        durationSeconds: session.durationSeconds,
        sessionStatus: session.sessionStatus,
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/activity/status/:transferId
 * Polled every 3 seconds by the receiver's viewer to check if transfer was revoked.
 */
activityRouter.get(
  '/status/:transferId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { transferId } = req.params
      const transfer = await Transfer.findOne({ transferId })

      if (!transfer) {
        res.status(404).json({ status: 'not_found', message: 'Transfer not found.' })
        return
      }

      if (transfer.status === 'revoked') {
        res.status(200).json({
          status: 'revoked',
          revoked: true,
          message: 'Access has been revoked by the sender. Viewing session terminated.',
        })
        return
      }

      res.status(200).json({
        status: transfer.status,
        revoked: false,
      })
    } catch (err) {
      next(err)
    }
  },
)

export default activityRouter

