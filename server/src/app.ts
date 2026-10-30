import express, { Application } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { config } from './config/env'
import apiRouter from './routes'
import { getDatabaseStatus } from './config/db'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'

/**
 * Creates and configures the Express application.
 * Separated from server.ts so the app can be imported and tested independently.
 */
export function createApp(): Application {
  const app = express()

  // ── Security headers ────────────────────────────────────────────────────
  // Allow cross-origin reads so Vercel frontend can consume API responses
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  // ── CORS Configuration ──────────────────────────────────────────────────
  const allowedOrigins: string[] = []

  if (config.clientUrl) {
    const split = config.clientUrl
      .split(',')
      .map((u) => u.trim().replace(/\/+$/, ''))
      .filter(Boolean)
    allowedOrigins.push(...split)
  }

  // Preserve local development origins
  const devOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
  ]
  for (const origin of devOrigins) {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin)
    }
  }

  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, uptime monitors)
        if (!requestOrigin) {
          return callback(null, true)
        }

        const normalized = requestOrigin.trim().replace(/\/+$/, '')

        // Check against explicitly configured client URLs or localhost dev servers
        if (allowedOrigins.includes(normalized)) {
          return callback(null, true)
        }

        // Allow any Vercel domain (*.vercel.app) for preview and production deployments
        if (/^https:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.vercel\.app$/.test(normalized)) {
          return callback(null, true)
        }

        // In development mode, allow all origins
        if (config.isDevelopment) {
          return callback(null, true)
        }

        callback(new Error(`CORS blocked for origin: ${requestOrigin}`))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
  )

  // ── Body parsing ────────────────────────────────────────────────────────
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // ── Root Health Checks (for Render / load balancers) ─────────────────────
  app.get('/', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'Encra 3.0 API',
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/health', (_req, res) => {
    const dbStatus = getDatabaseStatus()
    res.status(dbStatus.connected ? 200 : 503).json({
      status: dbStatus.connected ? 'ok' : 'degraded',
      service: 'Encra 3.0 API',
      database: {
        connected: dbStatus.connected,
        status: dbStatus.stateName,
      },
      timestamp: new Date().toISOString(),
    })
  })

  // ── Routes ──────────────────────────────────────────────────────────────
  app.use('/api', apiRouter)

  // ── 404 handler (must come after all routes) ────────────────────────────
  app.use(notFoundHandler)

  // ── Error handler (must be last middleware) ─────────────────────────────
  app.use(errorHandler)

  return app
}
