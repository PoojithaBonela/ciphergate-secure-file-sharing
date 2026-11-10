import { buildApiUrl } from '@/config/api'

export interface DeviceInfo {
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown'
  os: string
  browser: string
  browserVersion: string
  screenResolution: string
  userAgent: string
}

export interface AuthResults {
  secretCode: boolean
  password: boolean
  recipientOtp: boolean
  locationCheck: boolean
  cameraCheck: boolean
}

export interface LocationInfo {
  receiverCoordinates?: { latitude: number; longitude: number } | null
  distanceKm?: number | null
  verificationResult: 'passed' | 'failed' | 'disabled'
}

export interface StartActivityParams {
  transferId: string
  deviceInfo: DeviceInfo
  authResults: AuthResults
  locationInfo?: LocationInfo | null
}

export interface ActivityEventParams {
  transferId: string
  type: string
  title: string
  description: string
  details?: Record<string, unknown>
}

export interface EndActivityParams {
  transferId: string
  outcome?: string
  terminationReason?: string | null
  durationSeconds?: number | null
}

export interface DashboardData {
  transfer: {
    transferId: string
    originalFileName: string
    fileSize: number
    mimeType: string
    createdAt: string
    expiresAt?: string | null
    status: string
  }
  session: {
    sessionStatus: 'in_progress' | 'completed' | 'terminated' | 'revoked' | 'interrupted'
    startedAt: string
    endedAt?: string | null
    durationSeconds?: number | null
    outcome?: string | null
    terminationReason?: string | null
    receiverSnapshot: {
      url: string | null
      capturedAt: string | null
      hasSnapshot: boolean
    }
    deviceInfo: {
      deviceType: string
      os: string
      browser: string
      browserVersion: string
      screenResolution?: string
      userAgent?: string
      sessionStartTimestamp: string
    }
    locationInfo: {
      enabled: boolean
      permittedLocationName?: string | null
      permittedRadiusKm?: number | null
      receiverCoordinates?: { latitude: number; longitude: number } | null
      distanceKm?: number | null
      verificationResult: 'passed' | 'failed' | 'disabled'
      verifiedAt?: string | null
    }
    authResults: {
      secretCode: { verified: boolean; timestamp: string }
      password: { verified: boolean; timestamp: string }
      recipientOtp: { enabled: boolean; verified: boolean; timestamp?: string | null }
      locationCheck: { enabled: boolean; verified: boolean; timestamp?: string | null }
      cameraCheck: { enabled: boolean; verified: boolean; timestamp?: string | null }
    }
    securityEvents: Array<{
      id: string
      type: string
      title: string
      description: string
      timestamp: string
      details?: Record<string, unknown>
    }>
  }
}

/**
 * Utility function to detect current device, browser, and OS info
 */
export function detectDeviceInfo(): DeviceInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  let deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown' = 'Desktop'

  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = 'Tablet'
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle/i.test(ua)) {
    deviceType = 'Mobile'
  }

  // OS detection
  let os = 'Unknown OS'
  if (/windows/i.test(ua)) os = 'Windows'
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS'
  else if (/linux/i.test(ua)) os = 'Linux'

  // Browser detection
  let browser = 'Unknown Browser'
  let browserVersion = ''
  if (/edg\/([0-9.]+)/i.test(ua)) {
    browser = 'Edge'
    browserVersion = RegExp.$1
  } else if (/chrome\/([0-9.]+)/i.test(ua)) {
    browser = 'Chrome'
    browserVersion = RegExp.$1
  } else if (/firefox\/([0-9.]+)/i.test(ua)) {
    browser = 'Firefox'
    browserVersion = RegExp.$1
  } else if (/safari\/([0-9.]+)/i.test(ua) && !/chrome/i.test(ua)) {
    browser = 'Safari'
    browserVersion = RegExp.$1
  }

  const screenResolution =
    typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'Unknown'

  return {
    deviceType,
    os,
    browser,
    browserVersion,
    screenResolution,
    userAgent: ua,
  }
}

/**
 * Notifies the backend that viewing session has started.
 * Triggers Email One to the sender if notifications are enabled.
 */
export async function startActivitySession(params: StartActivityParams): Promise<void> {
  try {
    await fetch(buildApiUrl('/api/activity/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } catch (err) {
    console.warn('[Activity] Failed to report session start:', err)
  }
}

/**
 * Uploads captured receiver camera snapshot
 */
export async function uploadReceiverSnapshot(
  transferId: string,
  imageBase64: string,
): Promise<void> {
  try {
    await fetch(buildApiUrl('/api/activity/snapshot'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferId, imageBase64 }),
    })
  } catch (err) {
    console.warn('[Activity] Failed to upload snapshot:', err)
  }
}

/**
 * Records a real-time security event to the activity session
 */
export async function recordActivityEvent(params: ActivityEventParams): Promise<void> {
  try {
    await fetch(buildApiUrl('/api/activity/event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } catch (err) {
    console.warn('[Activity] Failed to record event:', err)
  }
}

/**
 * Notifies the backend that viewing session has ended.
 * Triggers Email Two to the sender if notifications are enabled.
 */
export async function endActivitySession(params: EndActivityParams): Promise<void> {
  try {
    const url = buildApiUrl('/api/activity/end')
    const body = JSON.stringify(params)

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(url, blob)
    } else {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
    }
  } catch (err) {
    console.warn('[Activity] Failed to report session end:', err)
  }
}

/**
 * Polled by receiver to detect immediate revocation by sender
 */
export async function checkTransferStatus(
  transferId: string,
): Promise<{ status: string; revoked: boolean; message?: string }> {
  try {
    const res = await fetch(buildApiUrl(`/api/activity/status/${encodeURIComponent(transferId)}`))
    if (!res.ok) {
      if (res.status === 410) {
        return { status: 'revoked', revoked: true }
      }
      return { status: 'unknown', revoked: false }
    }
    return await res.json()
  } catch {
    return { status: 'active', revoked: false }
  }
}

/**
 * Authenticates dashboard magic link token
 */
export async function authDashboard(
  token: string,
): Promise<{ success: boolean; transferId?: string; error?: string }> {
  try {
    const res = await fetch(buildApiUrl('/api/dashboard/auth'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data.message || 'Authentication failed.' }
    }

    return { success: true, transferId: data.transferId }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * Fetches dashboard live / final activity data
 */
export async function getDashboardData(
  token: string,
): Promise<{ success: boolean; data?: DashboardData; error?: string }> {
  try {
    const res = await fetch(`${buildApiUrl('/api/dashboard/data')}?token=${encodeURIComponent(token)}`)
    const json = await res.json()

    if (!res.ok) {
      return { success: false, error: json.message || 'Failed to load activity data.' }
    }

    return { success: true, data: json.data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * Revokes transfer access permanently from dashboard
 */
export async function revokeTransferAccess(
  token: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(buildApiUrl('/api/dashboard/revoke'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    const json = await res.json()
    if (!res.ok) {
      return { success: false, error: json.message || 'Failed to revoke transfer access.' }
    }

    return { success: true, message: json.message }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

