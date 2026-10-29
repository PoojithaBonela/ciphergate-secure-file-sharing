import express, { Application } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { config } from './config/env'
import apiRouter from './routes'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'

/**
 * Creates and configures the Express application.
 * Separated from server.ts so the app can be imported and tested independently.
 */
export function createApp(): Application {
  const app = express()

  // ── Security headers ────────────────────────────────────────────────────
  app.use(helmet())

  // ── CORS ────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true,
    }),
  )

  // ── Body parsing ────────────────────────────────────────────────────────
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // ── Routes ──────────────────────────────────────────────────────────────
  app.use('/api', apiRouter)

  // ── 404 handler (must come after all routes) ────────────────────────────
  app.use(notFoundHandler)

  // ── Error handler (must be last middleware) ─────────────────────────────
  app.use(errorHandler)

  return app
}
