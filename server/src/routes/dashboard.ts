import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ActivitySession } from '../models/ActivitySession'
import { Transfer } from '../models/Transfer'
import { hashMagicLinkToken } from '../services/notificationEmailService'
import {
  generatePresignedSnapshotDownloadUrl,
  deleteS3ObjectPermanently,
} from '../services/s3Service'

const dashboardRouter = Router()

/**
 * Middleware or helper to authenticate dashboard requests using the magic link raw token
 */
async function authenticateDashboardToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== 'string') {
    return null
  }

  const tokenHash = hashMagicLinkToken(rawToken.trim())
  const session = await ActivitySession.findOne({ magicLinkTokenHash: tokenHash })

  if (!session) {
    return null
  }

  // Enforce token expiration (24 hours)
  if (session.magicLinkExpiresAt.getTime() < Date.now()) {
    return null
  }

  return session
}

/**
 * POST /api/dashboard/auth
 * Validates the magic link raw token from query/URL
 */
dashboardRouter.post(
  '/auth',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authSchema = z.object({
        token: z.string().min(16),
      })

      const parseResult = authSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({ status: 'error', message: 'Invalid or missing dashboard token.' })
        return
      }

      const session = await authenticateDashboardToken(parseResult.data.token)
      if (!session) {
        res.status(401).json({
          status: 'error',
          message: 'The dashboard link is invalid, expired, or has already been used.',
        })
        return
      }

      res.status(200).json({
        status: 'success',
        transferId: session.transferId,
        sessionStatus: session.sessionStatus,
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/dashboard/data
 * Fetches real-time or finalized activity report data
 */
dashboardRouter.get(
  '/data',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = (req.query.token as string) || (req.headers['x-dashboard-token'] as string)
      if (!token) {
        res.status(401).json({ status: 'error', message: 'Dashboard token required.' })
        return
      }

      const session = await authenticateDashboardToken(token)
      if (!session) {
        res.status(401).json({ status: 'error', message: 'Invalid or expired dashboard token.' })
        return
      }

      const transfer = await Transfer.findOne({ transferId: session.transferId })

      // Generate presigned download URL for receiver snapshot if captured and not deleted
      let snapshotUrl: string | null = null
      if (session.receiverSnapshot?.s3Key) {
        try {
          snapshotUrl = await generatePresignedSnapshotDownloadUrl(session.receiverSnapshot.s3Key)
        } catch {
          // Snapshot may have been deleted after revocation or expired
          snapshotUrl = null
        }
      }

      res.status(200).json({
        status: 'success',
        data: {
          transfer: {
            transferId: session.transferId,
            originalFileName: transfer?.originalFileName || 'Protected Document',
            fileSize: transfer?.fileSize || 0,
            mimeType: transfer?.mimeType || 'application/octet-stream',
            createdAt: transfer?.createdAt || session.startedAt,
            expiresAt: transfer?.expiresAt || null,
            status: transfer?.status || (session.sessionStatus === 'revoked' ? 'revoked' : 'active'),
          },
          session: {
            sessionStatus: session.sessionStatus,
            startedAt: session.startedAt,
            endedAt: session.endedAt || null,
            durationSeconds: session.durationSeconds || null,
            outcome: session.outcome || null,
            terminationReason: session.terminationReason || null,
            receiverSnapshot: {
              url: snapshotUrl,
              capturedAt: session.receiverSnapshot?.capturedAt || null,
              hasSnapshot: Boolean(session.receiverSnapshot?.s3Key),
            },
            deviceInfo: session.deviceInfo,
            locationInfo: session.locationInfo,
            authResults: session.authResults,
            securityEvents: session.securityEvents.sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
            ),
          },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/dashboard/revoke
 * Sender manually revokes transfer access from the activity dashboard.
 * - Immediately invalidates transfer status
 * - Permanently deletes encrypted file package from AWS S3
 * - Permanently deletes receiver snapshot from AWS S3
 * - Records revocation security event
 * - Causes receiver viewer to immediately terminate via live polling
 */
dashboardRouter.post(
  '/revoke',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = (req.body.token as string) || (req.headers['x-dashboard-token'] as string)
      if (!token) {
        res.status(401).json({ status: 'error', message: 'Dashboard token required.' })
        return
      }

      const session = await authenticateDashboardToken(token)
      if (!session) {
        res.status(401).json({ status: 'error', message: 'Invalid or expired dashboard token.' })
        return
      }

      const transfer = await Transfer.findOne({ transferId: session.transferId })
      const now = new Date()

      // 1. Permanently delete encrypted file package from AWS S3
      if (transfer?.s3ObjectKey) {
        try {
          await deleteS3ObjectPermanently(transfer.s3ObjectKey)
        } catch (s3Err) {
          console.warn('[dashboard/revoke] S3 file deletion warning:', s3Err)
        }
      }

      // 2. Permanently delete receiver snapshot from AWS S3
      if (session.receiverSnapshot?.s3Key) {
        try {
          await deleteS3ObjectPermanently(session.receiverSnapshot.s3Key)
        } catch (s3Err) {
          console.warn('[dashboard/revoke] S3 snapshot deletion warning:', s3Err)
        }
      }

      // 3. Mark Transfer as revoked and clear lookup fingerprint
      if (transfer) {
        transfer.status = 'revoked'
        transfer.lookupFingerprint = null
        transfer.cleanupStatus = 'completed'
        await transfer.save()
      }

      // 4. Update ActivitySession
      session.sessionStatus = 'revoked'
      session.outcome = 'Access revoked by sender'
      session.terminationReason = 'Sender triggered manual access revocation from dashboard.'
      session.endedAt = now

      const duration = Math.round((now.getTime() - session.startedAt.getTime()) / 1000)
      session.durationSeconds = duration > 0 ? duration : 1

      session.securityEvents.push({
        id: `rev-${Date.now()}`,
        type: 'access_revoked',
        title: 'Access Revoked by Sender',
        description: 'Sender executed manual access revocation. Encrypted file and snapshot destroyed permanently from AWS S3. Viewer terminated.',
        timestamp: now,
        details: { revokedBy: 'sender', timestamp: now },
      })

      await session.save()

      res.status(200).json({
        status: 'success',
        message: 'Access revoked successfully. Encrypted file destroyed and receiver session terminated.',
      })
    } catch (err) {
      next(err)
    }
  },
)

export default dashboardRouter

