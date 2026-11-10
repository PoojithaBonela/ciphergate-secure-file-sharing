import { createHmac, randomBytes } from 'node:crypto'
import { config } from '../config/env'

/**
 * Computes an HMAC-SHA256 hash of a raw magic link token for storage in MongoDB.
 */
export function hashMagicLinkToken(token: string): string {
  const secret = config.lookupSecret || config.emailSecret || 'encra-default-magic-secret'
  return createHmac('sha256', secret).update(token.trim()).digest('hex')
}

/**
 * Generates a cryptographically secure 256-bit magic link token and its HMAC-SHA256 hash.
 */
export function generateMagicLinkToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashMagicLinkToken(rawToken)
  return { rawToken, tokenHash }
}

/**
 * Sends Email One via Brevo HTTP API:
 * Trigger: When the recipient has successfully completed all required authentication checks
 * and begins viewing the decrypted file.
 *
 * Subject: Your Encra file is being decrypted.
 *
 * STRICT REQUIREMENT: Contains ONLY this notification and a secure Encra dashboard link.
 * NO activity information, photographs, location details, coordinates, device info or events.
 */
export async function sendEmailOneDecryptionInProgress(
  senderEmail: string,
  rawToken: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = config.brevo.apiKey
  if (!apiKey) {
    console.error('[Brevo] BREVO_API_KEY is not configured for Email One.')
    return { success: false, error: 'Brevo API key is not configured.' }
  }

  const dashboardUrl = `${config.clientUrl}/dashboard?token=${encodeURIComponent(rawToken)}`
  const subject = 'Your Encra file is being decrypted.'

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Encra file is being decrypted.</title>
</head>
<body style="margin: 0; padding: 40px 16px; background-color: #050913; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F5F7FA;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #0A1220; border: 1px solid #202B3D; border-radius: 16px; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #F5F7FA;">
        ENCRA <span style="color: #2997FF; font-weight: 400;">3.0</span>
      </h1>
      <p style="margin: 6px 0 0; font-size: 12px; color: #8CA4C5; text-transform: uppercase; letter-spacing: 1.5px;">
        Zero-Knowledge Encrypted Transfer
      </p>
    </div>

    <div style="border-top: 1px solid #202B3D; padding-top: 24px; margin-bottom: 28px; text-align: center;">
      <p style="margin: 0 0 14px; font-size: 16px; font-weight: 500; color: #F5F7FA; line-height: 1.6;">
        Your Encra file is currently being decrypted and accessed.
      </p>
      <p style="margin: 0 0 28px; font-size: 14px; color: #8CA4C5; line-height: 1.6;">
        Click below to view the live activity details.
      </p>

      <div style="margin: 28px 0;">
        <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #2997FF 0%, #0070F3 100%); color: #FFFFFF; font-weight: 600; font-size: 14px; text-decoration: none; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 16px rgba(41, 151, 255, 0.35);">
          View Activity Dashboard
        </a>
      </div>
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
      console.error(`[Brevo Email 1] Failed (HTTP ${response.status}):`, errBody)
      return { success: false, error: `Brevo dispatch failed (HTTP ${response.status})` }
    }

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error'
    console.error('[Brevo Email 1] Exception:', msg)
    return { success: false, error: msg }
  }
}

/**
 * Sends Email Two via Brevo HTTP API:
 * Trigger: When the viewing session ends and the backend finalizes the activity record.
 *
 * Subject: Your Encra file has been decrypted. View the activity report.
 *
 * STRICT REQUIREMENT: Contains ONLY this notification and a secure dashboard link.
 * NO activity summaries, location, photographs or other details.
 */
export async function sendEmailTwoDecryptionCompleted(
  senderEmail: string,
  rawToken: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = config.brevo.apiKey
  if (!apiKey) {
    console.error('[Brevo] BREVO_API_KEY is not configured for Email Two.')
    return { success: false, error: 'Brevo API key is not configured.' }
  }

  const dashboardUrl = `${config.clientUrl}/dashboard?token=${encodeURIComponent(rawToken)}`
  const subject = 'Your Encra file has been decrypted. View the activity report.'

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Encra file has been decrypted. View the activity report.</title>
</head>
<body style="margin: 0; padding: 40px 16px; background-color: #050913; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F5F7FA;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #0A1220; border: 1px solid #202B3D; border-radius: 16px; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #F5F7FA;">
        ENCRA <span style="color: #2997FF; font-weight: 400;">3.0</span>
      </h1>
      <p style="margin: 6px 0 0; font-size: 12px; color: #8CA4C5; text-transform: uppercase; letter-spacing: 1.5px;">
        Zero-Knowledge Encrypted Transfer
      </p>
    </div>

    <div style="border-top: 1px solid #202B3D; padding-top: 24px; margin-bottom: 28px; text-align: center;">
      <p style="margin: 0 0 14px; font-size: 16px; font-weight: 500; color: #F5F7FA; line-height: 1.6;">
        Your Encra file viewing session has ended.
      </p>
      <p style="margin: 0 0 28px; font-size: 14px; color: #8CA4C5; line-height: 1.6;">
        Your complete activity report is now available.
      </p>

      <div style="margin: 28px 0;">
        <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #2997FF 0%, #0070F3 100%); color: #FFFFFF; font-weight: 600; font-size: 14px; text-decoration: none; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 16px rgba(41, 151, 255, 0.35);">
          View Complete Activity Report
        </a>
      </div>
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
      console.error(`[Brevo Email 2] Failed (HTTP ${response.status}):`, errBody)
      return { success: false, error: `Brevo dispatch failed (HTTP ${response.status})` }
    }

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error'
    console.error('[Brevo Email 2] Exception:', msg)
    return { success: false, error: msg }
  }
}

