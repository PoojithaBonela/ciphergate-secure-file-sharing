/**
 * Encra 3.0 Transfer Registration and Lookup API Service
 *
 * Coordinates transfer registration in MongoDB (storing only HMAC fingerprints)
 * and secure phrase-based transfer retrieval with short-lived presigned download URLs.
 * Never transmits passwords or encryption keys.
 */

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
  expiresAt?: string | null
}

export interface RegisterTransferResponse {
  status: 'success'
  transferId: string
  message: string
}

export interface TransferMetadata {
  transferId: string
  originalFileName: string
  mimeType: string
  fileSize: number
  createdAt: string
  expiresAt?: string | null
  downloadUrl: string
}

export interface LookupTransferResponse {
  status: 'success'
  transfer: TransferMetadata
}

/**
 * Registers an encrypted package transfer in MongoDB.
 * The backend computes and stores an HMAC-SHA-256 fingerprint.
 * Plaintext phrases are never stored in the database.
 */
export async function registerTransfer(
  params: RegisterTransferParams,
): Promise<RegisterTransferResponse> {
  const response = await fetch('/api/transfers/register', {
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
  const response = await fetch('/api/transfers/lookup', {
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
    if (response.status === 404) {
      throw new Error(
        data.message || 'Transfer not found or has expired. Please check your secret code.',
      )
    }
    throw new Error(data.message || `Lookup failed (HTTP ${response.status}).`)
  }

  const result = data as LookupTransferResponse
  if (!result.transfer || !result.transfer.downloadUrl) {
    throw new Error('Invalid response received from lookup service.')
  }

  return result.transfer
}
