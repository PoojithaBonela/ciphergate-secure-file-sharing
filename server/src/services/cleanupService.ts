import { Transfer } from '../models/Transfer'
import * as s3Service from './s3Service'

export interface CleanupResult {
  success: boolean
  message: string
  transferId?: string
}

export interface CycleStats {
  found: number
  cleaned: number
  failed: number
}

// Configurable storage deletion handler (defaults to AWS S3)
let storageDeletionHandler: (key: string) => Promise<boolean> = s3Service.deleteS3ObjectPermanently

export function setStorageDeletionHandler(handler: (key: string) => Promise<boolean>): void {
  storageDeletionHandler = handler
}

export function resetStorageDeletionHandler(): void {
  storageDeletionHandler = s3Service.deleteS3ObjectPermanently
}

/**
 * Consumes and permanently cleans up a single transfer immediately upon successful decryption.
 * Idempotent: safe to call multiple times without side effects or corrupt state.
 */
export async function consumeAndCleanTransfer(transferId: string): Promise<CleanupResult> {
  const existing = await Transfer.findOne({ transferId })

  // If already deleted from MongoDB, cleanup has already succeeded
  if (!existing) {
    return {
      success: true,
      message: 'Transfer already consumed and cleaned up.',
      transferId,
    }
  }

  // Atomically claim the transfer and immediately invalidate lookups
  const locked = await Transfer.findOneAndUpdate(
    {
      transferId,
      cleanupStatus: { $ne: 'in_progress' },
    },
    {
      $set: {
        status: 'consumed',
        consumedAt: existing.consumedAt ?? new Date(),
        lookupFingerprint: null, // Immediately remove lookup record
        cleanupStatus: 'in_progress',
        lastCleanupAttemptAt: new Date(),
      },
      $inc: { cleanupAttempts: 1 },
    },
    { returnDocument: 'after' },
  )

  if (!locked) {
    // Another worker or request is actively cleaning this transfer
    return {
      success: true,
      message: 'Cleanup operation is already in progress.',
      transferId,
    }
  }

  try {
    // 1. Delete encrypted package from S3 (handles versioned and standard buckets)
    await storageDeletionHandler(locked.s3ObjectKey)

    // 2. Remove MongoDB transfer metadata only after storage deletion is confirmed
    await Transfer.findByIdAndDelete(locked._id)

    return {
      success: true,
      message: 'Transfer consumed and permanently deleted from cloud storage.',
      transferId,
    }
  } catch (err: unknown) {
    const error = err as { message?: string }
    const errorMsg = error.message ?? 'S3 storage deletion failed'

    // Retain transfer in pending_cleanup so it is retried during the next scheduled cycle
    await Transfer.findByIdAndUpdate(locked._id, {
      $set: {
        status: 'pending_cleanup',
        cleanupStatus: 'failed',
        cleanupError: errorMsg,
      },
    })

    console.error(`[cleanup] Storage cleanup failed for ${transferId}: ${errorMsg}. Queued for retry.`)

    return {
      success: false,
      message: 'Transfer marked consumed. Cloud storage deletion queued for background retry.',
      transferId,
    }
  }
}

/**
 * Runs a full cleanup cycle across all expired or pending-cleanup transfers.
 * Concurrency-safe: claims documents atomically so multiple workers never conflict.
 */
export async function runCleanupCycle(): Promise<CycleStats> {
  const now = new Date()

  // Find candidate transfers:
  // 1. Expired transfers (expiresAt <= now and not yet deleted)
  // 2. Consumed or pending-cleanup transfers needing storage deletion
  const candidates = await Transfer.find({
    $or: [
      {
        expiresAt: { $lte: now },
        status: { $in: ['active', 'uploaded', 'expired', 'pending_cleanup'] },
      },
      {
        status: { $in: ['expired', 'consumed', 'pending_cleanup'] },
        cleanupStatus: { $in: ['none', 'pending', 'failed'] },
        cleanupAttempts: { $lt: 10 },
      },
    ],
  })
    .select('_id transferId s3ObjectKey status expiresAt cleanupAttempts')
    .lean()

  const stats: CycleStats = {
    found: candidates.length,
    cleaned: 0,
    failed: 0,
  }

  if (candidates.length === 0) {
    return stats
  }

  for (const candidate of candidates) {
    // Atomically claim the transfer for cleanup
    const locked = await Transfer.findOneAndUpdate(
      {
        _id: candidate._id,
        cleanupStatus: { $ne: 'in_progress' },
      },
      {
        $set: {
          status: candidate.status === 'consumed' ? 'consumed' : 'expired',
          lookupFingerprint: null, // Immediately remove lookup access
          cleanupStatus: 'in_progress',
          lastCleanupAttemptAt: new Date(),
        },
        $inc: { cleanupAttempts: 1 },
      },
      { returnDocument: 'after' },
    )

    if (!locked) {
      continue // Claimed by concurrent worker
    }

    try {
      // 1. Permanently delete encrypted object from S3
      await storageDeletionHandler(locked.s3ObjectKey)

      // 2. Remove transfer metadata from MongoDB after confirmed S3 deletion
      await Transfer.findByIdAndDelete(locked._id)

      stats.cleaned += 1
    } catch (err: unknown) {
      const error = err as { message?: string }
      const errorMsg = error.message ?? 'Unknown S3 deletion error'

      // Keep transfer inaccessible in pending_cleanup state and record failure
      await Transfer.findByIdAndUpdate(locked._id, {
        $set: {
          status: 'pending_cleanup',
          cleanupStatus: 'failed',
          cleanupError: errorMsg,
        },
      })

      stats.failed += 1
      console.warn(`[cleanup] Scheduled cleanup attempt failed for ${locked.transferId}: ${errorMsg}`)
    }
  }

  return stats
}
