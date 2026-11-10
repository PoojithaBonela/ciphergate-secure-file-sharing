import { Router } from 'express'
import healthRouter from './health'
import uploadsRouter from './uploads'
import transfersRouter from './transfers'
import notificationsRouter from './notifications'
import activityRouter from './activity'
import dashboardRouter from './dashboard'

/**
 * Root API router.
 * Mount all feature routers here so app.ts stays clean.
 */
const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/uploads', uploadsRouter)
apiRouter.use('/transfers', transfersRouter)
apiRouter.use('/notifications', notificationsRouter)
apiRouter.use('/activity', activityRouter)
apiRouter.use('/dashboard', dashboardRouter)

export default apiRouter
