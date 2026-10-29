import { Router } from 'express'
import healthRouter from './health'

/**
 * Root API router.
 * Mount all feature routers here so app.ts stays clean.
 */
const apiRouter = Router()

apiRouter.use('/health', healthRouter)

export default apiRouter
