/**
 * Encra 3.0 Sender Notification Email Verification API Service
 * Handles sender email OTP verification for access alerts.
 */

import { buildApiUrl } from '@/config/api'

export interface SendSenderOtpResponse {
  status: 'success'
  maskedEmail: string
  message: string
}

export interface VerifySenderOtpResponse {
  status: 'success'
  verified: boolean
  verificationToken: string
  message: string
}

export interface ResendSenderOtpResponse {
  status: 'success'
  maskedEmail: string
  message: string
}

/**
 * Requests a 6-digit OTP to verify the sender's notification email address.
 */
export async function sendSenderOtp(email: string): Promise<SendSenderOtpResponse> {
  const response = await fetch(buildApiUrl('/api/notifications/send-otp'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(data.message || 'Please wait before requesting a new verification code.')
    }
    throw new Error(data.message || `Failed to send verification code (HTTP ${response.status}).`)
  }

  return data as SendSenderOtpResponse
}

/**
 * Validates the 6-digit OTP entered by the sender.
 * Returns a signed cryptographic verification token upon success.
 */
export async function verifySenderOtp(
  email: string,
  otp: string,
): Promise<VerifySenderOtpResponse> {
  const response = await fetch(buildApiUrl('/api/notifications/verify-otp'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, otp }),
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
    throw new Error(data.message || `Verification failed (HTTP ${response.status}).`)
  }

  return data as VerifySenderOtpResponse
}

/**
 * Requests a new OTP code for the sender's notification email.
 */
export async function resendSenderOtp(email: string): Promise<ResendSenderOtpResponse> {
  const response = await fetch(buildApiUrl('/api/notifications/resend-otp'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(data.message || 'Please wait before requesting a new code.')
    }
    throw new Error(data.message || `Failed to resend code (HTTP ${response.status}).`)
  }

  return data as ResendSenderOtpResponse
}

