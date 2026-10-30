import mongoose from 'mongoose'
import { config } from './env'

/**
 * Strips sensitive credentials (username, password, hosts) from error messages
 * to ensure credentials are never leaked into server logs or output.
 */
function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://[REDACTED_AUTH]@')
    .replace(/(password|secret|auth)=([^&;\s]+)/gi, '$1=[REDACTED]')
}

/**
 * Connect to MongoDB Atlas using Mongoose before accepting HTTP requests.
 * Fails clearly without exposing URI, username, or password.
 */
export async function connectDatabase(): Promise<void> {
  const uri = config.mongodbUri

  if (!uri || !uri.trim()) {
    throw new Error(
      'MongoDB connection failed: MONGODB_URI environment variable is missing or empty. Please set MONGODB_URI in server/.env.',
    )
  }

  try {
    mongoose.set('strictQuery', true)

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      autoIndex: true,
    })

    console.log('[database] Successfully connected to MongoDB Atlas.')
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string }
    const rawMessage = error.message || 'Unknown database connection error'
    const sanitized = sanitizeErrorMessage(rawMessage)

    console.error(`[database] Failed to connect to MongoDB: ${sanitized}`)
    if (
      sanitized.includes('timed out') ||
      sanitized.includes('ETIMEDOUT') ||
      sanitized.includes('querySrv') ||
      sanitized.includes('ECONNREFUSED')
    ) {
      console.error(
        '[database] DIAGNOSTIC: If this occurs on Render, check MongoDB Atlas -> Network Access -> IP Access List. Add 0.0.0.0/0 (Allow access from anywhere) so dynamic cloud container IPs are permitted.',
      )
    }
    throw new Error(`MongoDB connection failed: ${sanitized}`)
  }
}

/**
 * Disconnect from MongoDB gracefully on shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
      console.log('[database] MongoDB connection closed gracefully.')
    }
  } catch (err: unknown) {
    const error = err as { message?: string }
    console.error('[database] Error during MongoDB disconnect:', sanitizeErrorMessage(error.message ?? 'Unknown'))
  }
}

/**
 * Diagnostic status for health check endpoint without credential exposure.
 */
export function getDatabaseStatus(): {
  connected: boolean
  readyState: number
  stateName: string
} {
  const readyState = mongoose.connection.readyState
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }

  return {
    connected: readyState === 1,
    readyState,
    stateName: states[readyState] ?? 'unknown',
  }
}
