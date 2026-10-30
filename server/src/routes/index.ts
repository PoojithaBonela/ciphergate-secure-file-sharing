import { Router } from 'express'
import healthRouter from './health'
import uploadsRouter from './uploads'
import transfersRouter from './transfers'

/**
 * Root API router.
 * Mount all feature routers here so app.ts stays clean.
 */
const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/uploads', uploadsRouter)
apiRouter.use('/transfers', transfersRouter)

export default apiRouter
