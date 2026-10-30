/**
 * Encra 3.0 API Configuration
 *
 * Centralizes backend API URL resolution.
 * - In production (Vercel): Uses import.meta.env.VITE_API_URL pointing to Render backend.
 * - In local development: Falls back to empty string so relative paths (/api/...)
 *   are handled by Vite's development proxy, or uses explicit VITE_API_URL if configured.
 * - Normalizes endpoints to prevent double slashes or duplicate /api prefixes.
 */

/**
 * Returns the normalized API base URL without trailing slashes.
 */
export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim()

  if (envUrl) {
    // Strip any trailing slashes
    return envUrl.replace(/\/+$/, '')
  }

  // Local development fallback:
  // Returning empty string preserves relative URLs (e.g. /api/uploads/presign)
  // which are proxied to http://localhost:5000 by Vite's dev server.
  return ''
}

/**
 * Constructs a fully qualified API URL for a given endpoint.
 * Safely prevents duplicate /api prefixes and malformed slashes.
 *
 * @param path - The API route (e.g., '/api/uploads/presign' or 'api/uploads/presign')
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
