import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto'
import { config } from '../config/env'

export interface EncryptedEmailPayload {
  version: number
  iv: string // 12 bytes hex
  authTag: string // 16 bytes hex
  ciphertext: string // hex
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16
const OTP_TOKEN_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Derives a deterministic 32-byte (256-bit) encryption key from the server email secret.
 */
function getEmailEncryptionKey(): Buffer {
  const secret = config.emailSecret || config.locationSecret || config.lookupSecret
  if (!secret) {
    throw new Error('ENCRA_EMAIL_SECRET is not configured on the server.')
  }
  return createHash('sha256').update(secret).digest()
}

/**
 * Encrypts recipient email address using AES-256-GCM before saving in MongoDB.
 */
export function encryptRecipientEmail(email: string): EncryptedEmailPayload {
  const normalized = email.trim().toLowerCase()
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Invalid email address format for encryption.')
  }

  const key = getEmailEncryptionKey()
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES })

  let ciphertext = cipher.update(normalized, 'utf8', 'hex')
  ciphertext += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return {
    version: 1,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext,
  }
}

/**
 * Decrypts recipient email address using AES-256-GCM.
 */
export function decryptRecipientEmail(payload: EncryptedEmailPayload): string {
  if (!payload || !payload.iv || !payload.authTag || !payload.ciphertext) {
    throw new Error('Incomplete or missing encrypted email payload.')
  }

  const key = getEmailEncryptionKey()
  const iv = Buffer.from(payload.iv, 'hex')
  const authTag = Buffer.from(payload.authTag, 'hex')

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error('Invalid IV length for AES-256-GCM email decryption.')
  }
  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Invalid auth tag length for AES-256-GCM email decryption.')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted.trim().toLowerCase()
}

/**
 * Masks an email address so that only a prefix/suffix and domain are visible.
 * Example: "poojithabonela19@gmail.com" -> "po***19@gmail.com"
 * Example: "ab@example.com" -> "a***@example.com"
 */
export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  const parts = normalized.split('@')
  if (parts.length !== 2) return '***@***.***'

  const [local, domain] = parts
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`
  }

  const visiblePrefix = local.slice(0, 2)
  const visibleSuffix = local.length > 4 ? local.slice(-2) : ''
  return `${visiblePrefix}***${visibleSuffix}@${domain}`
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP ("000000" - "999999").
 */
export function generateSecureOtp(): string {
  const num = randomInt(0, 1000000)
  return num.toString().padStart(6, '0')
}

/**
 * Hashes an OTP with HMAC-SHA-256 bound strictly to the transferId.
 */
export function hashOtp(transferId: string, otp: string): string {
  const secret = config.emailSecret || config.locationSecret || config.lookupSecret
  return createHmac('sha256', secret)
    .update(`${transferId}:otp:${otp}`)
    .digest('hex')
}

/**
 * Performs a constant-time comparison of a candidate OTP against the stored HMAC hash.
 */
export function verifyOtpHmac(transferId: string, candidateOtp: string, storedHash: string): boolean {
  if (!candidateOtp || !storedHash || candidateOtp.length !== 6) {
    return false
  }

  const candidateHash = hashOtp(transferId, candidateOtp)
  const candidateBuf = Buffer.from(candidateHash, 'hex')
  const storedBuf = Buffer.from(storedHash, 'hex')

  if (candidateBuf.length !== storedBuf.length) {
    return false
  }

  return timingSafeEqual(candidateBuf, storedBuf)
}

/**
 * Dispatches the 6-digit OTP to the recipient via Brevo Transactional Email HTTP API.
 */
export async function sendBrevoOtpEmail(
  recipientEmail: string,
  otp: string,
  originalFileName?: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = config.brevo.apiKey
  if (!apiKey) {
    console.error('[Brevo] BREVO_API_KEY is not configured.')
    return { success: false, error: 'Brevo API key is not configured.' }
  }

  const subject = 'Your Encra Verification Code'
  const fileNotice = originalFileName
    ? `<p style="margin: 0 0 16px; font-size: 14px; color: #8CA4C5;">A protected file (<strong>${escapeHtml(
      originalFileName,
    )}</strong>) has been shared with you via Encra.</p>`
    : ''

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Encra Verification Code</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #050913; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F5F7FA;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #0A1220; border: 1px solid #202B3D; border-radius: 16px; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #F5F7FA;">
        ENCRA <span style="color: #2997FF; font-weight: 400;">3.0</span>
      </h1>
      <p style="margin: 6px 0 0; font-size: 12px; color: #8CA4C5; text-transform: uppercase; letter-spacing: 1.5px;">
        Zero-Knowledge Encrypted Transfer
      </p>
    </div>

    <div style="border-top: 1px solid #202B3D; padding-top: 24px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #F5F7FA;">
        Verification Code
      </h2>
      ${fileNotice}
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #A1ADBF;">
        Enter this 6-digit one-time code to authenticate your access to this encrypted transfer:
      </p>

      <div style="text-align: center; margin: 28px 0; background: #050913; border: 1px solid #2997FF; border-radius: 12px; padding: 20px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 700; letter-spacing: 12px; color: #2997FF; padding-left: 12px;">
          ${otp}
        </span>
      </div>

      <div style="background-color: rgba(41, 151, 255, 0.08); border-left: 3px solid #2997FF; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 13px; color: #8CA4C5;">
          ⏱ <strong>Valid for 60 seconds only.</strong> Do not share this code with anyone.
        </p>
      </div>

      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #62758D;">
        If you did not request this file or were not expecting this transfer, you can safely ignore this email.
      </p>
    </div>

    <div style="border-top: 1px solid #202B3D; padding-top: 18px; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: #4B5E76;">
        Encra End-to-End Encrypted File Protection • Client-side Zero Knowledge
      </p>
    </div>
  </div>
</body>
</html>
  `

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: config.brevo.senderName || 'Encra',
          email: config.brevo.senderEmail,
        },
        to: [
          {
            email: recipientEmail,
          },
        ],
        subject,
        htmlContent,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error(`[Brevo] Failed to send email (HTTP ${response.status}):`, errBody)
      return { success: false, error: `Brevo email dispatch failed (HTTP ${response.status})` }
    }

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Brevo network error'
    console.error('[Brevo] Network error dispatching OTP:', message)
    return { success: false, error: message }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generates a signed, time-limited OTP authorization token after successful OTP verification.
 */
export function generateOtpAuthToken(transferId: string): string {
  const timestamp = Date.now().toString()
  const nonce = randomBytes(16).toString('hex')
  const payload = `${transferId}:${timestamp}:${nonce}`
  const secret = config.emailSecret || config.locationSecret || config.lookupSecret
  const signature = createHmac('sha256', secret).update(`otp-auth:${payload}`).digest('hex')
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url')
}

/**
 * Verifies that an OTP authorization token is valid, belongs to the correct transfer,
 * and has not expired.
 */
export function verifyOtpAuthToken(transferId: string, token: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
    const { payload, signature } = decoded
    if (typeof payload !== 'string' || typeof signature !== 'string') return false

    const [tokenTransferId, timestampStr] = payload.split(':')
    if (tokenTransferId !== transferId) return false

    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp) || Date.now() - timestamp > OTP_TOKEN_MAX_AGE_MS) {
      return false
    }

    const secret = config.emailSecret || config.locationSecret || config.lookupSecret
    const expectedSig = createHmac('sha256', secret).update(`otp-auth:${payload}`).digest('hex')

    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expectedSig, 'hex')
    if (sigBuf.length !== expBuf.length) return false

    return timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

const SENDER_TOKEN_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

/**
 * Hashes a sender notification OTP bound strictly to the sender's email.
 * Distinct from recipient transfer OTP hashes.
 */
export function hashSenderOtp(email: string, otp: string): string {
  const secret = config.emailSecret || config.locationSecret || config.lookupSecret
  const normalized = email.trim().toLowerCase()
  return createHmac('sha256', secret)
    .update(`sender-otp:${normalized}:${otp}`)
    .digest('hex')
}

/**
 * Constant-time comparison for sender notification OTP verification.
 */
export function verifySenderOtpHmac(email: string, candidateOtp: string, storedHash: string): boolean {
  if (!candidateOtp || !storedHash || candidateOtp.length !== 6) {
    return false
  }

  const candidateHash = hashSenderOtp(email, candidateOtp)
  const candidateBuf = Buffer.from(candidateHash, 'hex')
  const storedBuf = Buffer.from(storedHash, 'hex')

  if (candidateBuf.length !== storedBuf.length) {
    return false
  }

  return timingSafeEqual(candidateBuf, storedBuf)
}

/**
 * Generates a signed cryptographic token proving the sender's email was verified via OTP.
 * Valid for 1 hour so the sender can finish encrypting and uploading their transfer.
 */
export function generateSenderVerificationToken(email: string): string {
  const normalized = email.trim().toLowerCase()
  const timestamp = Date.now().toString()
  const nonce = randomBytes(16).toString('hex')
  const payload = `${normalized}:${timestamp}:${nonce}`
  const secret = config.emailSecret || config.locationSecret || config.lookupSecret
  const signature = createHmac('sha256', secret).update(`sender-verify:${payload}`).digest('hex')
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url')
}

/**
 * Verifies that a sender verification token is valid, matches the sender email,
 * and has not expired.
 */
export function verifySenderVerificationToken(email: string, token: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
    const { payload, signature } = decoded
    if (typeof payload !== 'string' || typeof signature !== 'string') return false

    const [tokenEmail, timestampStr] = payload.split(':')
    if (tokenEmail !== email.trim().toLowerCase()) return false

    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp) || Date.now() - timestamp > SENDER_TOKEN_MAX_AGE_MS) {
      return false
    }

    const secret = config.emailSecret || config.locationSecret || config.lookupSecret
    const expectedSig = createHmac('sha256', secret).update(`sender-verify:${payload}`).digest('hex')

    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expectedSig, 'hex')
    if (sigBuf.length !== expBuf.length) return false

    return timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

/**
 * Dispatches a 6-digit verification code to the sender's email address via Brevo.
 */
export async function sendBrevoSenderOtpEmail(
  senderEmail: string,
  otp: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = config.brevo.apiKey
  if (!apiKey) {
    console.error('[Brevo] BREVO_API_KEY is not configured.')
    return { success: false, error: 'Brevo API key is not configured.' }
  }

  const subject = 'Verify your email for Encra Notifications'

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verify your email for Encra Notifications</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #050913; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F5F7FA;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #0A1220; border: 1px solid #202B3D; border-radius: 16px; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #F5F7FA;">
        ENCRA <span style="color: #2997FF; font-weight: 400;">3.0</span>
      </h1>
      <p style="margin: 6px 0 0; font-size: 12px; color: #8CA4C5; text-transform: uppercase; letter-spacing: 1.5px;">
        Sender Notification Verification
      </p>
    </div>

    <div style="border-top: 1px solid #202B3D; padding-top: 24px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #F5F7FA;">
        Verify Your Notification Email
      </h2>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #A1ADBF;">
        Enter this 6-digit one-time code to confirm your email address. Once verified, Encra will send you an alert whenever your file is accessed and decrypted:
      </p>

      <div style="text-align: center; margin: 28px 0; background: #050913; border: 1px solid #2997FF; border-radius: 12px; padding: 20px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 700; letter-spacing: 12px; color: #2997FF; padding-left: 12px;">
          ${otp}
        </span>
      </div>

      <div style="background-color: rgba(41, 151, 255, 0.08); border-left: 3px solid #2997FF; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 13px; color: #8CA4C5;">
          ⏱ <strong>Valid for 60 seconds only.</strong> Do not share this code with anyone.
        </p>
      </div>

      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #62758D;">
        If you did not request this verification on Encra, you can safely ignore this email.
      </p>
    </div>

    <div style="border-top: 1px solid #202B3D; padding-top: 18px; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: #4B5E76;">
        Encra End-to-End Encrypted File Protection • Client-side Zero Knowledge
      </p>
    </div>
  </div>
</body>
</html>
  `

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: config.brevo.senderName || 'Encra',
          email: config.brevo.senderEmail,
        },
        to: [
          {
            email: senderEmail,
          },
        ],
        subject,
        htmlContent,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error(`[Brevo] Failed to send sender OTP email (HTTP ${response.status}):`, errBody)
      return { success: false, error: `Brevo email dispatch failed (HTTP ${response.status})` }
    }

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Brevo network error'
    console.error('[Brevo] Network error dispatching sender OTP:', message)
    return { success: false, error: message }
  }
}




