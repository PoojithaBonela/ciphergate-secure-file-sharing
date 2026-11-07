import { runCleanupCycle } from './cleanupService'

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const INITIAL_DELAY_MS = 5 * 1000 // 5 seconds after server start

let timerId: NodeJS.Timeout | null = null
let isRunning = false

/**
 * Executes a single scheduled cleanup run with reentrancy guard.
 */
async function executeCycle(): Promise<void> {
  if (isRunning) {
    return
  }

  isRunning = true
  try {
    const stats = await runCleanupCycle()
    if (stats.found > 0) {
      console.log(
        `[cleanup-scheduler] Processed ${stats.found} transfers: ${stats.cleaned} cleaned, ${stats.failed} retrying.`,
      )
    }
  } catch (err: unknown) {
    const error = err as { message?: string }
    console.error(`[cleanup-scheduler] Error during cleanup cycle: ${error.message ?? 'Unknown'}`)
  } finally {
    isRunning = false
  }
}

/**
 * Starts the 5-minute background cleanup scheduler.
 */
export function startCleanupScheduler(): void {
  if (timerId) {
    return
  }

  console.log('[cleanup-scheduler] Scheduled cleanup job started (runs every 5 minutes).')

  // Run initial pass shortly after startup
  setTimeout(() => {
    void executeCycle()
  }, INITIAL_DELAY_MS)

  // Recurring 5-minute interval
  timerId = setInterval(() => {
    void executeCycle()
  }, CLEANUP_INTERVAL_MS)
}

/**
 * Gracefully stops the cleanup scheduler during shutdown.
 */
export function stopCleanupScheduler(): void {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
    console.log('[cleanup-scheduler] Cleanup scheduler stopped gracefully.')
  }
}
