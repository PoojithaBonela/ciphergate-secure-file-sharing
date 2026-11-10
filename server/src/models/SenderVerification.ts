import { Schema, model, Document } from 'mongoose'

export interface ISenderVerification extends Document {
  email: string
  hash: string
  expiresAt: Date
  attempts: number
  lastSentAt: Date
  verified: boolean
  verifiedAt?: Date | null
  verificationToken?: string | null
  createdAt: Date
  updatedAt: Date
}

const senderVerificationSchema = new Schema<ISenderVerification>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    hash: {
      type: String,
      default: '',
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    verified: {
      type: Boolean,
      required: true,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verificationToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
)

// Automatically remove expired or stale verification records after 2 hours
senderVerificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 })

export const SenderVerification = model<ISenderVerification>(
  'SenderVerification',
  senderVerificationSchema,
)

