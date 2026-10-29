import { createApp } from './app'
import { config } from './config/env'

/**
 * Entry point — creates the Express app and starts the HTTP server.
 */
const app = createApp()

const server = app.listen(config.port, () => {
  console.log(`[server] Encra API running on http://localhost:${config.port}`)
  console.log(`[server] Environment: ${config.nodeEnv}`)
  console.log(`[server] CORS origin:  ${config.clientUrl}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — shutting down gracefully.')
  server.close(() => {
    console.log('[server] HTTP server closed.')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('\n[server] SIGINT received — shutting down gracefully.')
  server.close(() => {
    console.log('[server] HTTP server closed.')
    process.exit(0)
  })
})
