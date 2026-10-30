/**
 * Encra 3.0 API Configuration
 *
 * Centralizes backend API URL resolution across environments.
 * - In production & preview (Vercel / any remote domain):
 *     Uses import.meta.env.VITE_API_URL, and falls back to the production
 *     Render URL (https://ciphergate-secure-file-sharing.onrender.com) so requests
 *     NEVER erroneously hit the Vercel static CDN.
 * - In local development (localhost / 127.0.0.1):
 *     Falls back to empty string so relative paths (/api/...) are routed
 *     to http://localhost:5000 by Vite's development proxy.
 * - URL normalization:
 *     Strips trailing slashes and prevents duplicate /api prefixes.
 */

export const DEFAULT_PRODUCTION_API_URL = 'https://ciphergate-secure-file-sharing.onrender.com'

/**
 * Checks whether the application is running in a local development environment.
 */
function isLocalEnvironment(): boolean {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local')
    ) {
      return true
    }
  }
  return typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
}

/**
 * Returns the normalized API base URL without trailing slashes.
 */
export function getApiBaseUrl(): string {
  const envUrl = (
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_API_URL as string | undefined)
      : undefined
  )?.trim()

  if (envUrl) {
    // Strip trailing slashes
    return envUrl.replace(/\/+$/, '')
  }

  // If running locally, return empty string so Vite's proxy forwards to http://localhost:5000
  if (isLocalEnvironment()) {
    return ''
  }

  // In production / preview (e.g. *.vercel.app), default to the live Render backend
  // to guarantee requests never hit the Vercel static CDN.
  return DEFAULT_PRODUCTION_API_URL
}

/**
 * Constructs a fully qualified API URL for a given endpoint.
 * Safely prevents duplicate /api prefixes and malformed slashes.
 *
 * @param path - The API route (e.g., '/api/uploads/presign')
 * @returns Fully formatted URL targeting Render in production or local proxy in development.
 */
export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl()
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  if (!base) {
    return cleanPath
  }

  // If base already contains /api at the end and path starts with /api/, deduplicate
  if (base.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return `${base}${cleanPath.slice(4)}`
  }

  return `${base}${cleanPath}`
}
