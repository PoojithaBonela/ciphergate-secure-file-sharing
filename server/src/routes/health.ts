import { Router, Request, Response } from 'express'
import { getDatabaseStatus } from '../config/db'

const healthRouter = Router()

/**
 * GET /api/health
 * Connectivity and liveness check — reports server & MongoDB status without exposing credentials.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus()

  res.status(dbStatus.connected ? 200 : 503).json({
    status: dbStatus.connected ? 'ok' : 'degraded',
    message: dbStatus.connected ? 'Encra API and Database are operational.' : 'Database connection not ready.',
    database: {
      connected: dbStatus.connected,
      status: dbStatus.stateName,
    },
    timestamp: new Date().toISOString(),
  })
})

export default healthRouter
