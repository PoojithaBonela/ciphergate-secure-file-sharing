import { Schema, model, Document } from 'mongoose'
import { randomUUID } from 'node:crypto'

export type ActivitySessionStatus =
  | 'in_progress'
  | 'completed'
  | 'terminated'
  | 'revoked'
  | 'interrupted'

export interface ISecurityEvent {
  id: string
  type: string
  title: string
  description: string
  timestamp: Date
  details?: Record<string, unknown>
}

export interface IActivitySession extends Document {
  transferId: string
  magicLinkTokenHash: string
  magicLinkExpiresAt: Date
  sessionStatus: ActivitySessionStatus
  startedAt: Date
  endedAt?: Date | null
  durationSeconds?: number | null
  outcome?: string | null
  terminationReason?: string | null
  emailOneSentAt?: Date | null
  emailTwoSentAt?: Date | null
  receiverSnapshot?: {
    s3Key: string | null
    capturedAt: Date | null
  }
  deviceInfo: {
    deviceType: string
    os: string
    browser: string
    browserVersion: string
    screenResolution?: string
    userAgent?: string
    sessionStartTimestamp: Date
  }
  locationInfo: {
    enabled: boolean
    permittedLocationName?: string | null
    permittedRadiusKm?: number | null
    receiverCoordinates?: {
      latitude: number
      longitude: number
    } | null
    distanceKm?: number | null
    verificationResult: 'passed' | 'failed' | 'disabled'
    verifiedAt?: Date | null
  }
  authResults: {
    secretCode: { verified: boolean; timestamp: Date }
    password: { verified: boolean; timestamp: Date }
    recipientOtp: { enabled: boolean; verified: boolean; timestamp?: Date | null }
    locationCheck: { enabled: boolean; verified: boolean; timestamp?: Date | null }
    cameraCheck: { enabled: boolean; verified: boolean; timestamp?: Date | null }
  }
  securityEvents: ISecurityEvent[]
  createdAt: Date
  updatedAt: Date
}

const securityEventSchema = new Schema<ISecurityEvent>(
  {
    id: { type: String, default: () => randomUUID() },
    type: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    timestamp: { type: Date, default: () => new Date() },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
)

const activitySessionSchema = new Schema<IActivitySession>(
  {
    transferId: {
      type: String,
      required: true,
      index: true,
    },
    magicLinkTokenHash: {
      type: String,
      required: true,
      index: true,
    },
    magicLinkExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    sessionStatus: {
      type: String,
      enum: ['in_progress', 'completed', 'terminated', 'revoked', 'interrupted'],
      default: 'in_progress',
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: null,
    },
    outcome: {
      type: String,
      default: null,
    },
    terminationReason: {
      type: String,
      default: null,
    },
    emailOneSentAt: {
      type: Date,
      default: null,
    },
    emailTwoSentAt: {
      type: Date,
      default: null,
    },
    receiverSnapshot: {
      s3Key: { type: String, default: null },
      capturedAt: { type: Date, default: null },
    },
    deviceInfo: {
      deviceType: { type: String, default: 'Desktop' },
      os: { type: String, default: 'Unknown' },
      browser: { type: String, default: 'Unknown' },
      browserVersion: { type: String, default: 'Unknown' },
      screenResolution: { type: String, default: 'Unknown' },
      userAgent: { type: String, default: '' },
      sessionStartTimestamp: { type: Date, default: () => new Date() },
    },
    locationInfo: {
      enabled: { type: Boolean, default: false },
      permittedLocationName: { type: String, default: null },
      permittedRadiusKm: { type: Number, default: null },
      receiverCoordinates: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
      },
      distanceKm: { type: Number, default: null },
      verificationResult: {
        type: String,
        enum: ['passed', 'failed', 'disabled'],
        default: 'disabled',
      },
      verifiedAt: { type: Date, default: null },
    },
    authResults: {
      secretCode: {
        verified: { type: Boolean, default: true },
        timestamp: { type: Date, default: () => new Date() },
      },
      password: {
        verified: { type: Boolean, default: true },
        timestamp: { type: Date, default: () => new Date() },
      },
      recipientOtp: {
        enabled: { type: Boolean, default: false },
        verified: { type: Boolean, default: false },
        timestamp: { type: Date, default: null },
      },
      locationCheck: {
        enabled: { type: Boolean, default: false },
        verified: { type: Boolean, default: false },
        timestamp: { type: Date, default: null },
      },
      cameraCheck: {
        enabled: { type: Boolean, default: false },
        verified: { type: Boolean, default: false },
        timestamp: { type: Date, default: null },
      },
    },
    securityEvents: [securityEventSchema],
  },
  {
    timestamps: true,
    versionKey: false,
  },
)

activitySessionSchema.index({ transferId: 1, createdAt: -1 })

export const ActivitySession = model<IActivitySession>('ActivitySession', activitySessionSchema)

