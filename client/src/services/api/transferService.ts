/**
 * Encra 3.0 Transfer Registration and Lookup API Service
 *
 * Coordinates transfer registration in MongoDB (storing only HMAC fingerprints)
 * and secure phrase-based transfer retrieval with short-lived presigned download URLs.
 * Never transmits passwords or encryption keys.
 */

import { buildApiUrl } from '@/config/api'

export const SEVEN_WORD_REGEX = /^[a-z]+( [a-z]+){6}$/

/**
 * Validates whether a candidate string strictly conforms to exactly seven lowercase
 * words separated by single spaces.
 */
export function isValidSevenWordCode(code: string): boolean {
  if (typeof code !== 'string') return false
  return SEVEN_WORD_REGEX.test(code)
}

/**
 * Counts the number of words currently entered in a secret code.
 */
export function countWordsInCode(code: string): number {
  const trimmed = code.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

export interface RegisterTransferParams {
  sevenWordCode: string
  s3ObjectKey: string
  originalFileName: string
  mimeType: string
  fileSize: number
  expiryMinutes?: number | null
  expiresAt?: string | null
  accessLevel?: 'standard' | 'verified'
  recipientEmail?: string | null
  locationEnabled?: boolean
  cameraCheckEnabled?: boolean
  location?: {
    latitude: number
    longitude: number
    radiusKm: number
    locationName: string
  } | null
}

export interface RegisterTransferResponse {
  status: 'success'
  transferId: string
  expiresAt: string
  message: string
}

export interface TransferMetadata {
  transferId: string
  originalFileName: string
  mimeType: string
  fileSize: number
  createdAt: string
  expiresAt?: string | null
  otpRequired?: boolean
  maskedEmail?: string
  locationRequired?: boolean
  cameraCheckRequired?: boolean
  radiusKm?: number
  locationName?: string
  downloadUrl?: string
}

export interface VerifyOtpResponse {
  status: 'success'
  verified: boolean
  locationRequired: boolean
  otpAuthToken?: string
  downloadUrl?: string
  message: string
}

export interface ResendOtpResponse {
  status: 'success'
  message: string
}

export interface VerifyLocationParams {
  transferId: string
  latitude: number
  longitude: number
}

export interface VerifyLocationResponse {
  status: 'success'
  authorized: boolean
  authToken: string
  downloadUrl: string
  message: string
}

export interface LookupTransferResponse {
  status: 'success'
  transfer: TransferMetadata
}

export interface ConsumeTransferResponse {
  status: 'success'
  message: string
}

/**
 * Registers an encrypted package transfer in MongoDB.
 * The backend computes and stores an HMAC-SHA-256 fingerprint.
 * Plaintext phrases are never stored in the database.
 */
export async function registerTransfer(
  params: RegisterTransferParams,
): Promise<RegisterTransferResponse> {
  const response = await fetch(buildApiUrl('/api/transfers/register'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 409) {
      throw new Error(
        data.message ||
          'This 7-word secret code is already in use. Please choose a different code.',
      )
    }
    throw new Error(data.message || `Transfer registration failed (HTTP ${response.status}).`)
  }

  return data as RegisterTransferResponse
}

/**
 * Looks up a transfer using the 7-word secret code.
 * Backend verifies the HMAC fingerprint and returns permitted metadata
 * with a short-lived presigned GET URL for package download.
 */
export async function lookupTransfer(
  sevenWordCode: string,
): Promise<TransferMetadata> {
  const response = await fetch(buildApiUrl('/api/transfers/lookup'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sevenWordCode }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        data.message || 'Too many lookup attempts. Please wait a minute and try again.',
      )
    }
    if (response.status === 410) {
      throw new Error(
        data.message || 'This transfer has expired and is no longer available.',
      )
    }
    if (response.status === 404) {
      throw new Error(
        data.message || 'Transfer not found or has expired. Please check your secret code.',
      )
    }
    throw new Error(data.message || `Lookup failed (HTTP ${response.status}).`)
  }

  const result = data as LookupTransferResponse
  if (!result.transfer) {
    throw new Error('Invalid response received from lookup service.')
  }

  return result.transfer
}

/**
 * Submits the receiver's current coordinates for backend Haversine distance verification.
 * If within the permitted radius, returns a short-lived signed authorization token
 * and authorized S3 retrieval URL.
 * Does not permanently save or log receiver coordinates.
 */
export async function verifyReceiverLocation(
  params: VerifyLocationParams,
): Promise<VerifyLocationResponse> {
  const response = await fetch(buildApiUrl('/api/transfers/verify-location'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        data.message ||
          `Access denied. You are outside the permitted geographic boundary for this file transfer.`,
      )
    }
    if (response.status === 410) {
      throw new Error(data.message || 'This transfer has expired and is no longer available.')
    }
    throw new Error(data.message || `Location verification failed (HTTP ${response.status}).`)
  }

  return data as VerifyLocationResponse
}

/**
 * Validates the receiver's submitted 6-digit OTP code on the backend.
 * Only upon successful verification is file retrieval authorized.
 */
export async function verifyTransferOtp(
  transferId: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  const response = await fetch(buildApiUrl('/api/transfers/verify-otp'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transferId, otp }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(data.message || 'Incorrect verification code. Please check and try again.')
    }
    if (response.status === 410) {
      throw new Error(data.message || 'Verification code has expired. Please request a new code.')
    }
    if (response.status === 429) {
      throw new Error(data.message || 'Too many attempts. Please request a new code.')
    }
    throw new Error(data.message || `OTP verification failed (HTTP ${response.status}).`)
  }

  return data as VerifyOtpResponse
}

/**
 * Requests a new 6-digit OTP code dispatched to the verified recipient email.
 * Enforces server-side cooldown.
 */
export async function resendTransferOtp(
  transferId: string,
): Promise<ResendOtpResponse> {
  const response = await fetch(buildApiUrl('/api/transfers/resend-otp'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transferId }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(data.message || 'Please wait before requesting a new code.')
    }
    throw new Error(data.message || `Failed to resend code (HTTP ${response.status}).`)
  }

  return data as ResendOtpResponse
}

/**
 * Informs the backend that client-side decryption has completed successfully,
 * immediately invalidating the transfer and permanently destroying the encrypted file in S3.
 */
export async function consumeTransfer(transferId: string): Promise<ConsumeTransferResponse> {
  const response = await fetch(buildApiUrl('/api/transfers/consume'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transferId }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || `Transfer cleanup notification failed (HTTP ${response.status}).`)
  }

  return data as ConsumeTransferResponse
}
