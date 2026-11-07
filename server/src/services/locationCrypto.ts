import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { config } from '../config/env'

export interface LocationConfig {
  latitude: number
  longitude: number
  radiusKm: number
  locationName: string
}

export interface EncryptedLocationPayload {
  version: number
  iv: string // 12 bytes hex (24 chars)
  authTag: string // 16 bytes hex (32 chars)
  ciphertext: string // hex
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Derives a deterministic 32-byte (256-bit) encryption key from the server secret.
 */
function getLocationEncryptionKey(): Buffer {
  const secret = config.locationSecret || config.lookupSecret
  if (!secret) {
    throw new Error('ENCRA_LOCATION_SECRET is not configured on the server.')
  }
  return createHash('sha256').update(secret).digest()
}

/**
 * Encrypts location configuration using AES-256-GCM.
 * Generates a fresh cryptographically random 12-byte IV for every call.
 * Authenticated encryption ensures confidentiality and integrity.
 */
export function encryptLocationConfig(data: LocationConfig): EncryptedLocationPayload {
  // Validate coordinates and radius
  if (typeof data.latitude !== 'number' || data.latitude < -90 || data.latitude > 90) {
    throw new Error('Invalid latitude value. Must be between -90 and 90.')
  }
  if (typeof data.longitude !== 'number' || data.longitude < -180 || data.longitude > 180) {
    throw new Error('Invalid longitude value. Must be between -180 and 180.')
  }
  if (typeof data.radiusKm !== 'number' || data.radiusKm <= 0 || data.radiusKm > 500) {
    throw new Error('Invalid radius value. Must be between 0 and 500 km.')
  }

  const key = getLocationEncryptionKey()
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES })

  const plaintext = JSON.stringify({
    latitude: data.latitude,
    longitude: data.longitude,
    radiusKm: data.radiusKm,
    locationName: (data.locationName || '').trim().slice(0, 255),
  })

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return {
    version: 1,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted,
  }
}

/**
 * Decrypts and validates encrypted location configuration using AES-256-GCM.
 * Throws if auth tag verification fails or data is corrupted.
 */
export function decryptLocationConfig(payload: EncryptedLocationPayload): LocationConfig {
  if (!payload || !payload.iv || !payload.authTag || !payload.ciphertext) {
    throw new Error('Incomplete or missing encrypted location payload.')
  }

  const key = getLocationEncryptionKey()
  const iv = Buffer.from(payload.iv, 'hex')
  const authTag = Buffer.from(payload.authTag, 'hex')

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error('Invalid IV length for AES-256-GCM.')
  }
  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Invalid auth tag length for AES-256-GCM.')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  const parsed = JSON.parse(decrypted) as LocationConfig

  if (
    typeof parsed.latitude !== 'number' ||
    typeof parsed.longitude !== 'number' ||
    typeof parsed.radiusKm !== 'number'
  ) {
    throw new Error('Decrypted location data is malformed or invalid.')
  }

  return parsed
}

/**
 * Calculates the great-circle distance between two geographic coordinates
 * on Earth using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance in kilometers
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const EARTH_RADIUS_KM = 6371.0088

  const toRad = (degree: number) => (degree * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

/**
 * Generates a short-lived, tamper-proof HMAC-SHA-256 authorization token
 * cryptographically tied to a specific transferId.
 */
export function generateLocationAuthToken(transferId: string): string {
  const key = getLocationEncryptionKey()
  const timestamp = Date.now()
  const nonce = randomBytes(8).toString('hex')
  const message = `${transferId}:${timestamp}:${nonce}`
  const signature = createHmac('sha256', key).update(message).digest('hex')

  return Buffer.from(`${message}:${signature}`).toString('base64url')
}

/**
 * Validates a signed location authorization token.
 * Ensures the token matches the specific transferId, has not expired, and signature is intact.
 */
export function verifyLocationAuthToken(transferId: string, token: string): boolean {
  try {
    if (!token || typeof token !== 'string') return false
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 4) return false

    const [tokenTransferId, timestampStr, nonce, receivedSig] = parts
    if (tokenTransferId !== transferId) return false

    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) return false

    const now = Date.now()
    // Reject expired tokens or tokens with timestamps too far in future
    if (now - timestamp > TOKEN_MAX_AGE_MS || timestamp > now + 10000) {
      return false
    }

    const key = getLocationEncryptionKey()
    const expectedMessage = `${tokenTransferId}:${timestampStr}:${nonce}`
    const expectedSig = createHmac('sha256', key).update(expectedMessage).digest('hex')

    const bufExpected = Buffer.from(expectedSig, 'hex')
    const bufReceived = Buffer.from(receivedSig, 'hex')

    if (bufExpected.length !== bufReceived.length) return false
    return timingSafeEqual(bufExpected, bufReceived)
  } catch {
    return false
  }
}

