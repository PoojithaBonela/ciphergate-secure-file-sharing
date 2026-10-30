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
  mongodbUri: process.env['MONGODB_URI'] ?? '',
  lookupSecret: process.env['ENCRA_LOOKUP_SECRET'] ?? '',
  aws: {
    region: process.env['AWS_REGION'] ?? 'ap-southeast-2',
    bucket: process.env['AWS_S3_BUCKET'] ?? 'encra-encrypted-files',
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
  },
} as const
