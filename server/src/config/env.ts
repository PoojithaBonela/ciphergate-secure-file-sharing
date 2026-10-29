import 'dotenv/config'

/**
 * Centralised application configuration loaded from environment variables.
 * All env access should go through this module — never read process.env directly
 * from other modules.
 */
export const config = {
  port: parseInt(process.env['PORT'] ?? '5000', 10),
  clientUrl: process.env['CLIENT_URL'] ?? 'http://localhost:3000',
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  isDevelopment: (process.env['NODE_ENV'] ?? 'development') === 'development',
} as const
