import { createApp } from './app'
import { config } from './config/env'
import { connectDatabase, disconnectDatabase } from './config/db'

/**
 * Entry point — connects to MongoDB first, then starts the HTTP server.
 * Connects before accepting any API requests, and fails cleanly if connection fails.
 */
async function startServer(): Promise<void> {
  try {
    // Connect to database before accepting incoming traffic
    await connectDatabase()

    const app = createApp()

    const server = app.listen(config.port, () => {
      console.log(`[server] Encra API running on http://localhost:${config.port}`)
      console.log(`[server] Environment: ${config.nodeEnv}`)
      console.log(`[server] CORS origin:  ${config.clientUrl}`)
    })

    const shutdown = (signal: string) => {
      console.log(`\n[server] ${signal} received — shutting down gracefully.`)
      server.close(async () => {
        console.log('[server] HTTP server closed.')
        await disconnectDatabase()
        process.exit(0)
      })
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error: unknown) {
    const err = error as { message?: string }
    console.error(`[server] Fatal startup failure: ${err.message || 'Database connection error'}`)
    process.exit(1)
  }
}

void startServer()
