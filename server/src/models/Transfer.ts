import { Schema, model, Document } from 'mongoose'
import { randomBytes } from 'node:crypto'

export type TransferStatus = 'pending' | 'uploaded' | 'expired' | 'deleted'

/**
 * Transfer document interface.
 * Strictly metadata only — NO passwords, plaintext code, or cryptographic keys are ever stored.
 */
export interface ITransfer extends Document {
  transferId: string
  lookupFingerprint: string
  s3ObjectKey: string
  originalFileName: string
  originalFilename?: string
  mimeType: string
  fileSize: number
  encryptedPackageSize?: number
  status: TransferStatus
  createdAt: Date
  expiresAt?: Date | null
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
      required: true,
      unique: true,
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
      enum: ['pending', 'uploaded', 'expired', 'deleted'],
      default: 'uploaded',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Virtual compatibility aliases
transferSchema.virtual('originalFilename').get(function (this: ITransfer) {
  return this.originalFileName
})
transferSchema.virtual('encryptedPackageSize').get(function (this: ITransfer) {
  return this.fileSize
})

export const Transfer = model<ITransfer>('Transfer', transferSchema)
