import { Schema, model, Document } from 'mongoose'
import { randomBytes } from 'node:crypto'

export type TransferStatus =
  | 'active'
  | 'uploaded'
  | 'consumed'
  | 'expired'
  | 'pending_cleanup'
  | 'deleted'

export type CleanupStatus =
  | 'none'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'

/**
 * Transfer document interface.
 * Strictly metadata only — NO passwords, plaintext code, or cryptographic keys are ever stored.
 */
export interface ITransfer extends Document {
  transferId: string
  lookupFingerprint: string | null
  s3ObjectKey: string
  originalFileName: string
  originalFilename?: string
  mimeType: string
  fileSize: number
  encryptedPackageSize?: number
  status: TransferStatus
  locationEnabled: boolean
  encryptedLocation?: {
    version: number
    iv: string
    authTag: string
    ciphertext: string
  } | null
  createdAt: Date
  expiresAt: Date
  consumedAt?: Date | null
  cleanupStatus: CleanupStatus
  cleanupAttempts: number
  lastCleanupAttemptAt?: Date | null
  cleanupError?: string | null
}

const transferSchema = new Schema<ITransfer>(
  {
    transferId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Cryptographically unpredictable 128-bit hex string (32 characters)
      default: () => randomBytes(16).toString('hex'),
    },
    lookupFingerprint: {
      type: String,
      default: null,
      sparse: true,
      index: true,
      // 64-character hex string from HMAC-SHA-256
      match: [/^[a-f0-9]{64}$/, 'Invalid lookup fingerprint format.'],
    },
    s3ObjectKey: {
      type: String,
      required: true,
      index: true,
      trim: true,
      match: [/^encra-[a-f0-9-]+\.encra$/, 'Invalid S3 object key format.'],
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      default: 'application/octet-stream',
    },
    fileSize: {
      type: Number,
      required: true,
      min: [1, 'File size must be greater than 0.'],
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'uploaded', 'consumed', 'expired', 'pending_cleanup', 'deleted'],
      default: 'active',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    locationEnabled: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    encryptedLocation: {
      type: {
        version: { type: Number, default: 1 },
        iv: { type: String, required: true },
        authTag: { type: String, required: true },
        ciphertext: { type: String, required: true },
      },
      default: null,
    },
    cleanupStatus: {
      type: String,
      required: true,
      enum: ['none', 'pending', 'in_progress', 'completed', 'failed'],
      default: 'none',
      index: true,
    },
    cleanupAttempts: {
      type: Number,
      required: true,
      default: 0,
    },
    lastCleanupAttemptAt: {
      type: Date,
      default: null,
    },
    cleanupError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Compound indexes for high-throughput expiry and cleanup queries
transferSchema.index({ expiresAt: 1, status: 1 })
transferSchema.index({ cleanupStatus: 1, cleanupAttempts: 1 })

// Virtual compatibility aliases
transferSchema.virtual('originalFilename').get(function (this: ITransfer) {
  return this.originalFileName
})
transferSchema.virtual('encryptedPackageSize').get(function (this: ITransfer) {
  return this.fileSize
})

export const Transfer = model<ITransfer>('Transfer', transferSchema)
