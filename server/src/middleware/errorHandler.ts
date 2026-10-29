import { Request, Response, NextFunction } from 'express'

/**
 * Standard API error shape returned to clients.
 */
export interface ApiError {
  status: number
  message: string
  details?: unknown
}

/**
 * Custom error class used to communicate known HTTP errors through
 * the Express error-handling chain.
 */
export class HttpError extends Error {
  public readonly status: number
  public readonly details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

/**
 * Central Express error-handling middleware.
 * Must be registered after all routes and other middleware.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      status: err.status,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    })
    return
  }

  // Unexpected errors — do not leak internal details to the client
  console.error('[Unhandled Error]', err)
  res.status(500).json({
    status: 500,
    message: 'An unexpected error occurred.',
  })
}

/**
 * Catch-all 404 handler for routes that were not matched.
 * Must be registered after all routes but before errorHandler.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  })
}
