import { Router, Request, Response } from 'express'

const router = Router()

/**
 * GET /api/health
 * Lightweight liveness check — no database query, no external calls.
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'Encra API is running.',
    timestamp: new Date().toISOString(),
  })
})

export default router
