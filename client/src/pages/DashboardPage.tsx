import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  FileText,
  MapPin,
  Laptop,
  Smartphone,
  Tablet,
  AlertTriangle,
  Radio,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Trash2,
  ArrowLeft,
  Layers,
  Compass,
} from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import {
  authDashboard,
  getDashboardData,
  revokeTransferAccess,
  DashboardData,
} from '@/services/api/activityService'

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return '--'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const remSecs = seconds % 60
  if (mins < 60) return `${mins}m ${remSecs}s`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs}h ${remMins}m ${remSecs}s`
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function formatTimeOnly(dateStr?: string | null): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function DashboardPage() {
  const [searchParams] = useSearchParams()
  const rawToken = searchParams.get('token') || ''

  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Revocation Modal state
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokeSuccessMessage, setRevokeSuccessMessage] = useState<string | null>(null)
  const [revokeErrorMessage, setRevokeErrorMessage] = useState<string | null>(null)

  // Live timer for in-progress session
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState<number>(0)

  // Fetch dashboard data
  const fetchData = useCallback(
    async (isBackground = false) => {
      if (!rawToken) return
      if (!isBackground) setIsRefreshing(true)

      const result = await getDashboardData(rawToken)
      if (result.success && result.data) {
        setDashboardData(result.data)
        setAuthError(null)
      } else if (!isBackground) {
        setAuthError(result.error || 'Failed to authenticate dashboard.')
      }

      setIsLoading(false)
      setIsRefreshing(false)
    },
    [rawToken],
  )

  // Initial load
  useEffect(() => {
    if (!rawToken) {
      setAuthError('No dashboard authentication token provided. Please use the secure link sent to your email.')
      setIsLoading(false)
      return
    }

    void authDashboard(rawToken).then((authRes) => {
      if (!authRes.success) {
        setAuthError(authRes.error || 'This dashboard link is invalid, expired, or has already been used.')
        setIsLoading(false)
      } else {
        void fetchData(false)
      }
    })
  }, [rawToken, fetchData])

  // Polling interval if session is in progress
  const isInProgress = dashboardData?.session.sessionStatus === 'in_progress'

  useEffect(() => {
    if (!isInProgress) return

    const pollInterval = setInterval(() => {
      void fetchData(true)
    }, 3000)

    return () => clearInterval(pollInterval)
  }, [isInProgress, fetchData])

  // Live timer counter during active viewing
  useEffect(() => {
    if (!isInProgress || !dashboardData?.session.startedAt) return

    const startMs = new Date(dashboardData.session.startedAt).getTime()
    const updateTimer = () => {
      const now = Date.now()
      setLiveElapsedSeconds(Math.max(1, Math.round((now - startMs) / 1000)))
    }

    updateTimer()
    const timerInterval = setInterval(updateTimer, 1000)

    return () => clearInterval(timerInterval)
  }, [isInProgress, dashboardData?.session.startedAt])

  // Handle Revoke Access
  const handleConfirmRevoke = async () => {
    if (!rawToken) return
    setIsRevoking(true)
    setRevokeErrorMessage(null)

    const res = await revokeTransferAccess(rawToken)
    setIsRevoking(false)

    if (res.success) {
      setRevokeSuccessMessage(res.message || 'Access was permanently revoked.')
      setIsRevokeModalOpen(false)
      // Immediately refresh data to reflect revoked state
      void fetchData(false)
    } else {
      setRevokeErrorMessage(res.error || 'Failed to revoke access.')
    }
  }

  // Device icon helper
  const DeviceIcon = useMemo(() => {
    const type = dashboardData?.session.deviceInfo.deviceType?.toLowerCase()
    if (type === 'mobile') return Smartphone
    if (type === 'tablet') return Tablet
    return Laptop
  }, [dashboardData?.session.deviceInfo.deviceType])

  // Status pill config
  const statusBadge = useMemo(() => {
    const status = dashboardData?.session.sessionStatus
    if (status === 'in_progress') {
      return {
        label: 'DECRYPTION IN PROGRESS',
        bgColor: 'bg-[#2997FF]/15',
        textColor: 'text-[#2997FF]',
        borderColor: 'border-[#2997FF]/40',
        pulse: true,
      }
    }
    if (status === 'completed') {
      return {
        label: 'VIEWING SESSION ENDED',
        bgColor: 'bg-emerald-500/15',
        textColor: 'text-emerald-400',
        borderColor: 'border-emerald-500/30',
        pulse: false,
      }
    }
    if (status === 'terminated') {
      return {
        label: 'SESSION TERMINATED',
        bgColor: 'bg-amber-500/15',
        textColor: 'text-amber-400',
        borderColor: 'border-amber-500/30',
        pulse: false,
      }
    }
    if (status === 'revoked') {
      return {
        label: 'ACCESS REVOKED',
        bgColor: 'bg-red-500/15',
        textColor: 'text-red-400',
        borderColor: 'border-red-500/30',
        pulse: false,
      }
    }
    return {
      label: status?.toUpperCase() || 'UNKNOWN',
      bgColor: 'bg-[#202B3D]',
      textColor: 'text-[#8CA4C5]',
      borderColor: 'border-[#27374D]',
      pulse: false,
    }
  }, [dashboardData?.session.sessionStatus])

  // Check if transfer can be revoked
  const isRevocable = useMemo(() => {
    if (!dashboardData) return false
    const transferStatus = dashboardData.transfer.status
    const sessionStatus = dashboardData.session.sessionStatus
    return (
      transferStatus !== 'revoked' &&
      transferStatus !== 'consumed' &&
      transferStatus !== 'deleted' &&
      transferStatus !== 'expired' &&
      sessionStatus !== 'revoked'
    )
  }, [dashboardData])

  return (
    <div className="min-h-screen flex flex-col bg-[#050913] text-[#F5F7FA]">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        {/* Error State */}
        {authError && !isLoading && (
          <div className="max-w-md mx-auto my-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <ShieldX className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-[#F5F7FA] mb-3">Dashboard Access Denied</h1>
            <p className="text-sm text-[#8CA4C5] leading-relaxed mb-8">{authError}</p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0A1220] border border-[#202B3D] text-[#2997FF] hover:bg-[#111D2E] text-sm font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Encra Home
            </Link>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center my-32">
            <div className="w-10 h-10 border-2 border-[#2997FF]/30 border-t-[#2997FF] rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-[#8CA4C5]">Authenticating magic link session...</p>
          </div>
        )}

        {/* Authenticated Dashboard Content */}
        {!isLoading && !authError && dashboardData && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* ── Top Header Banner ─────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#202B3D]">
              <div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F7FA]">
                    Sender Activity Dashboard
                  </h1>

                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${statusBadge.bgColor} ${statusBadge.textColor} ${statusBadge.borderColor}`}
                  >
                    {statusBadge.pulse && (
                      <span className="w-2 h-2 rounded-full bg-[#2997FF] animate-ping" />
                    )}
                    {statusBadge.label}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-[#8CA4C5]">
                  Transfer Ref:{' '}
                  <span className="font-mono text-[#F5F7FA] font-medium">
                    {dashboardData.transfer.transferId}
                  </span>
                  <span className="mx-2 text-[#27374D]">•</span>
                  Document:{' '}
                  <span className="text-[#F5F7FA] font-medium">
                    {dashboardData.transfer.originalFileName}
                  </span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => fetchData(false)}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0A1220] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] hover:bg-[#111D2E] text-xs font-medium transition-colors cursor-pointer"
                  title="Refresh activity logs"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#2997FF]' : ''}`}
                  />
                  <span>Refresh</span>
                </button>

                {/* Revoke Access Button (Prominent when revocable) */}
                {isRevocable ? (
                  <button
                    type="button"
                    onClick={() => setIsRevokeModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold tracking-wide transition-all shadow-[0_0_12px_rgba(239,68,68,0.15)] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>REVOKE ACCESS</span>
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-[#0A1220] border border-[#202B3D] text-[#8CA4C5] text-xs font-medium">
                    Storage Status: <strong className="text-[#F5F7FA] uppercase">{dashboardData.transfer.status}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Notification Alert Banners */}
            {revokeSuccessMessage && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400 text-sm">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <span>{revokeSuccessMessage}</span>
              </div>
            )}

            {/* ── Key Metrics Overview Grid ─────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Metric 1: Viewing Duration */}
              <div className="p-5 rounded-2xl bg-[#0A1220] border border-[#202B3D] flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#111D2E] border border-[#27374D] flex items-center justify-center text-[#2997FF]">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-[#8CA4C5] font-semibold">
                    {isInProgress ? 'Live Duration' : 'Total Viewing Duration'}
                  </div>
                  <div className="text-xl font-bold text-[#F5F7FA] font-mono mt-0.5">
                    {isInProgress
                      ? formatDuration(liveElapsedSeconds)
                      : formatDuration(dashboardData.session.durationSeconds)}
                  </div>
                  {isInProgress && (
                    <div className="flex items-center gap-1.5 text-[11px] text-[#2997FF] mt-1">
                      <Radio className="w-3 h-3 animate-pulse" />
                      <span>Active viewer stream</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metric 2: Session Outcome */}
              <div className="p-5 rounded-2xl bg-[#0A1220] border border-[#202B3D] flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#111D2E] border border-[#27374D] flex items-center justify-center text-[#2997FF]">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-[#8CA4C5] font-semibold">
                    Decryption Outcome
                  </div>
                  <div className="text-sm font-semibold text-[#F5F7FA] mt-0.5 line-clamp-1">
                    {isInProgress
                      ? 'Decryption in progress...'
                      : dashboardData.session.outcome || 'Session finalized'}
                  </div>
                  <div className="text-[11px] text-[#8CA4C5] mt-1">
                    {isInProgress
                      ? 'Recipient currently viewing document'
                      : dashboardData.session.terminationReason
                        ? `Reason: ${dashboardData.session.terminationReason}`
                        : 'Decryption completed normally'}
                  </div>
                </div>
              </div>

              {/* Metric 3: Device / Browser */}
              <div className="p-5 rounded-2xl bg-[#0A1220] border border-[#202B3D] flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#111D2E] border border-[#27374D] flex items-center justify-center text-[#2997FF]">
                  <DeviceIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-[#8CA4C5] font-semibold">
                    Recipient Device
                  </div>
                  <div className="text-sm font-semibold text-[#F5F7FA] mt-0.5">
                    {dashboardData.session.deviceInfo.os} • {dashboardData.session.deviceInfo.browser} {dashboardData.session.deviceInfo.browserVersion || ''}
                  </div>
                  <div className="text-[11px] text-[#8CA4C5] mt-1">
                    {dashboardData.session.deviceInfo.deviceType} ({dashboardData.session.deviceInfo.screenResolution || 'Standard'})
                  </div>
                </div>
              </div>

              {/* Metric 4: Geofence or Security Status */}
              <div className="p-5 rounded-2xl bg-[#0A1220] border border-[#202B3D] flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#111D2E] border border-[#27374D] flex items-center justify-center text-[#2997FF]">
                  {dashboardData.session.locationInfo.enabled ? (
                    <MapPin className="w-6 h-6" />
                  ) : (
                    <Shield className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-[#8CA4C5] font-semibold">
                    {dashboardData.session.locationInfo.enabled ? 'Location Verification' : 'Access Level'}
                  </div>
                  <div className="text-sm font-semibold text-[#F5F7FA] mt-0.5">
                    {dashboardData.session.locationInfo.enabled
                      ? dashboardData.session.locationInfo.verificationResult === 'passed'
                        ? 'Passed & Verified'
                        : 'Failed'
                      : dashboardData.session.authResults.recipientOtp.enabled
                        ? 'Verified Access'
                        : 'Standard Access'}
                  </div>
                  <div className="text-[11px] text-[#8CA4C5] mt-1">
                    {dashboardData.session.locationInfo.enabled
                      ? `${dashboardData.session.locationInfo.permittedRadiusKm || 5} km permitted radius`
                      : 'Zero-Knowledge Protection Active'}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Main Dashboard Layout ───────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column (2 Cols): Chronological Activity Timeline */}
              <div className="lg:col-span-2 space-y-8">
                <div className="p-6 rounded-2xl bg-[#0A1220] border border-[#202B3D]">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#202B3D]">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-5 h-5 text-[#2997FF]" />
                      <h2 className="text-base font-bold text-[#F5F7FA]">
                        Security Activity Timeline
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#8CA4C5]">
                      <span className="w-2 h-2 rounded-full bg-[#2997FF]" />
                      <span>{dashboardData.session.securityEvents.length} events logged</span>
                    </div>
                  </div>

                  {/* Final Report Summary Header if Session is finalized */}
                  {!isInProgress && (
                    <div className="mb-6 p-4 rounded-xl bg-[#050913] border border-[#27374D] space-y-2 text-xs">
                      <div className="font-semibold text-[#F5F7FA] text-sm mb-2 flex items-center justify-between">
                        <span>Final Activity Summary</span>
                        <span className="text-[#2997FF] font-mono">
                          Duration: {formatDuration(dashboardData.session.durationSeconds)}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#8CA4C5]">
                        <div>Session Started: <strong className="text-[#F5F7FA]">{formatDate(dashboardData.session.startedAt)}</strong></div>
                        <div>Session Ended: <strong className="text-[#F5F7FA]">{formatDate(dashboardData.session.endedAt)}</strong></div>
                        <div>Final Status: <strong className="text-[#F5F7FA] uppercase">{dashboardData.session.sessionStatus}</strong></div>
                        <div>Outcome: <strong className="text-[#F5F7FA]">{dashboardData.session.outcome || 'Finalized'}</strong></div>
                      </div>
                    </div>
                  )}

                  {/* Timeline Events List */}
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#202B3D]">
                    {dashboardData.session.securityEvents.length === 0 ? (
                      <p className="text-xs text-[#8CA4C5]">No security events logged yet.</p>
                    ) : (
                      dashboardData.session.securityEvents.map((evt, idx) => {
                        const isTermination = evt.type.includes('termination')
                        const isWarning = evt.type.includes('warning')
                        const isRevocation = evt.type.includes('revoked')
                        const isStart = evt.type === 'session_started'

                        let dotColor = 'bg-[#2997FF]'
                        if (isTermination || isRevocation) dotColor = 'bg-red-500'
                        else if (isWarning) dotColor = 'bg-amber-400'
                        else if (isStart) dotColor = 'bg-emerald-400'

                        return (
                          <div key={evt.id || idx} className="relative group">
                            {/* Dot indicator */}
                            <span
                              className={`absolute -left-[27px] top-1.5 w-3 h-3 rounded-full border-2 border-[#0A1220] ${dotColor}`}
                            />

                            <div className="p-3.5 rounded-xl bg-[#050913] border border-[#202B3D] transition-all hover:border-[#27374D]">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <h3 className="text-xs font-semibold text-[#F5F7FA] flex items-center gap-1.5">
                                  {isWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                                  {isTermination && <ShieldAlert className="w-3.5 h-3.5 text-red-400" />}
                                  {isRevocation && <ShieldX className="w-3.5 h-3.5 text-red-500" />}
                                  <span>{evt.title}</span>
                                </h3>
                                <time className="text-[11px] font-mono text-[#8CA4C5]">
                                  {formatTimeOnly(evt.timestamp)}
                                </time>
                              </div>
                              <p className="text-xs text-[#8CA4C5] leading-relaxed">{evt.description}</p>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column (1 Col): Transfer Metadata & Authentication Details */}
              <div className="space-y-8">
                {/* 1. Transfer Information Details */}
                <div className="p-6 rounded-2xl bg-[#0A1220] border border-[#202B3D]">
                  <h2 className="text-base font-bold text-[#F5F7FA] mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#2997FF]" />
                    <span>Transfer Metadata</span>
                  </h2>

                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between py-2 border-b border-[#202B3D]">
                      <span className="text-[#8CA4C5]">Original Filename</span>
                      <span className="text-[#F5F7FA] font-medium max-w-[180px] truncate text-right">
                        {dashboardData.transfer.originalFileName}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-[#202B3D]">
                      <span className="text-[#8CA4C5]">Transfer Reference</span>
                      <span className="text-[#F5F7FA] font-mono">
                        {dashboardData.transfer.transferId}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-[#202B3D]">
                      <span className="text-[#8CA4C5]">Package Size</span>
                      <span className="text-[#F5F7FA] font-mono">
                        {formatBytes(dashboardData.transfer.fileSize)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-[#202B3D]">
                      <span className="text-[#8CA4C5]">Creation Time</span>
                      <span className="text-[#F5F7FA]">
                        {formatDate(dashboardData.transfer.createdAt)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-[#202B3D]">
                      <span className="text-[#8CA4C5]">Expiry Time</span>
                      <span className="text-[#F5F7FA]">
                        {formatDate(dashboardData.transfer.expiresAt)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2">
                      <span className="text-[#8CA4C5]">Current Status</span>
                      <span className="text-[#F5F7FA] uppercase font-semibold">
                        {dashboardData.transfer.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Authentication Layers Breakdown */}
                <div className="p-6 rounded-2xl bg-[#0A1220] border border-[#202B3D]">
                  <h2 className="text-base font-bold text-[#F5F7FA] mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#2997FF]" />
                    <span>Authentication Results</span>
                  </h2>

                  <div className="space-y-3">
                    {/* Layer 1: 7-word Code */}
                    <div className="p-3 rounded-xl bg-[#050913] border border-[#202B3D] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="text-xs font-semibold text-[#F5F7FA]">
                            Seven-Word Secret Code
                          </div>
                          <div className="text-[10px] text-[#8CA4C5]">HMAC-SHA-256 zero-knowledge match</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Verified
                      </span>
                    </div>

                    {/* Layer 2: Password */}
                    <div className="p-3 rounded-xl bg-[#050913] border border-[#202B3D] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="text-xs font-semibold text-[#F5F7FA]">
                            File Decryption Password
                          </div>
                          <div className="text-[10px] text-[#8CA4C5]">PBKDF2 600,000 iterations</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Verified
                      </span>
                    </div>

                    {/* Layer 3: Recipient Email OTP (Only if enabled) */}
                    <div className="p-3 rounded-xl bg-[#050913] border border-[#202B3D] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {dashboardData.session.authResults.recipientOtp.enabled ? (
                          dashboardData.session.authResults.recipientOtp.verified ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-amber-400" />
                          )
                        ) : (
                          <MinusCircle className="w-4 h-4 text-[#8CA4C5]/50" />
                        )}
                        <div>
                          <div className="text-xs font-semibold text-[#F5F7FA]">
                            Recipient Email OTP
                          </div>
                          <div className="text-[10px] text-[#8CA4C5]">
                            {dashboardData.session.authResults.recipientOtp.enabled
                              ? 'Verified Access via Brevo'
                              : 'Feature disabled for this transfer'}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${dashboardData.session.authResults.recipientOtp.enabled
                            ? dashboardData.session.authResults.recipientOtp.verified
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-[#202B3D] text-[#8CA4C5]'
                          }`}
                      >
                        {dashboardData.session.authResults.recipientOtp.enabled
                          ? dashboardData.session.authResults.recipientOtp.verified
                            ? 'Passed'
                            : 'Pending'
                          : 'Disabled'}
                      </span>
                    </div>

                    {/* Layer 4: Location Verification */}
                    <div className="p-3 rounded-xl bg-[#050913] border border-[#202B3D] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {dashboardData.session.locationInfo.enabled ? (
                          dashboardData.session.locationInfo.verificationResult === 'passed' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )
                        ) : (
                          <MinusCircle className="w-4 h-4 text-[#8CA4C5]/50" />
                        )}
                        <div>
                          <div className="text-xs font-semibold text-[#F5F7FA]">
                            Location Geofencing
                          </div>
                          <div className="text-[10px] text-[#8CA4C5]">
                            {dashboardData.session.locationInfo.enabled
                              ? `Radius: ${dashboardData.session.locationInfo.permittedRadiusKm || '--'} km`
                              : 'Feature disabled for this transfer'}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${dashboardData.session.locationInfo.enabled
                            ? dashboardData.session.locationInfo.verificationResult === 'passed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-[#202B3D] text-[#8CA4C5]'
                          }`}
                      >
                        {dashboardData.session.locationInfo.enabled
                          ? dashboardData.session.locationInfo.verificationResult === 'passed'
                            ? 'Passed'
                            : 'Failed'
                          : 'Disabled'}
                      </span>
                    </div>

                    {/* Layer 5: Camera Check Presence */}
                    <div className="p-3 rounded-xl bg-[#050913] border border-[#202B3D] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {dashboardData.session.authResults.cameraCheck.enabled ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <MinusCircle className="w-4 h-4 text-[#8CA4C5]/50" />
                        )}
                        <div>
                          <div className="text-xs font-semibold text-[#F5F7FA]">
                            Camera Check Presence
                          </div>
                          <div className="text-[10px] text-[#8CA4C5]">
                            {dashboardData.session.authResults.cameraCheck.enabled
                              ? 'Active presence & gaze monitor'
                              : 'Feature disabled for this transfer'}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${dashboardData.session.authResults.cameraCheck.enabled
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-[#202B3D] text-[#8CA4C5]'
                          }`}
                      >
                        {dashboardData.session.authResults.cameraCheck.enabled ? 'Granted' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Location Information Card (ONLY IF location verification was enabled) */}
                {dashboardData.session.locationInfo.enabled && (
                  <div className="p-6 rounded-2xl bg-[#0A1220] border border-[#202B3D]">
                    <h2 className="text-base font-bold text-[#F5F7FA] mb-4 flex items-center gap-2">
                      <Compass className="w-4 h-4 text-[#2997FF]" />
                      <span>Location Geofence Information</span>
                    </h2>

                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between py-2 border-b border-[#202B3D]">
                        <span className="text-[#8CA4C5]">Permitted Location</span>
                        <span className="text-[#F5F7FA] font-medium max-w-[180px] truncate text-right">
                          {dashboardData.session.locationInfo.permittedLocationName || 'Specified geographic coordinates'}
                        </span>
                      </div>

                      <div className="flex justify-between py-2 border-b border-[#202B3D]">
                        <span className="text-[#8CA4C5]">Permitted Radius</span>
                        <span className="text-[#F5F7FA] font-mono">
                          {dashboardData.session.locationInfo.permittedRadiusKm} km
                        </span>
                      </div>

                      {dashboardData.session.locationInfo.receiverCoordinates ? (
                        <div className="flex justify-between py-2 border-b border-[#202B3D]">
                          <span className="text-[#8CA4C5]">Receiver Coordinates</span>
                          <span className="text-[#F5F7FA] font-mono">
                            {dashboardData.session.locationInfo.receiverCoordinates.latitude.toFixed(4)},{' '}
                            {dashboardData.session.locationInfo.receiverCoordinates.longitude.toFixed(4)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between py-2 border-b border-[#202B3D]">
                          <span className="text-[#8CA4C5]">Receiver Coordinates</span>
                          <span className="text-[#8CA4C5] italic">Not recorded</span>
                        </div>
                      )}

                      {dashboardData.session.locationInfo.distanceKm !== undefined &&
                        dashboardData.session.locationInfo.distanceKm !== null && (
                          <div className="flex justify-between py-2 border-b border-[#202B3D]">
                            <span className="text-[#8CA4C5]">Calculated Distance</span>
                            <span className="text-[#F5F7FA] font-mono">
                              {dashboardData.session.locationInfo.distanceKm.toFixed(1)} km
                            </span>
                          </div>
                        )}

                      <div className="flex justify-between py-2 border-b border-[#202B3D]">
                        <span className="text-[#8CA4C5]">Verification Timestamp</span>
                        <span className="text-[#F5F7FA]">
                          {formatDate(dashboardData.session.locationInfo.verifiedAt)}
                        </span>
                      </div>

                      <div className="flex justify-between py-2">
                        <span className="text-[#8CA4C5]">Verification Result</span>
                        <span className="text-emerald-400 font-semibold uppercase tracking-wider text-[11px]">
                          {dashboardData.session.locationInfo.verificationResult}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Revocation Confirmation Modal ──────────────────────────── */}
      {isRevokeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#0A1220] border border-red-500/30 shadow-[0_10px_40px_rgba(239,68,68,0.2)]">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-[#F5F7FA] mb-2">Revoke Transfer Access?</h3>

            <p className="text-xs text-[#8CA4C5] leading-relaxed mb-6">
              Revoking access will <strong className="text-red-400">immediately terminate</strong> any
              active viewing session, permanently delete the encrypted file package from AWS S3, and
              invalidate the transfer. This action cannot be undone.
            </p>

            {revokeErrorMessage && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-xs">
                {revokeErrorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsRevokeModalOpen(false)}
                disabled={isRevoking}
                className="px-4 py-2 rounded-xl bg-[#050913] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={isRevoking}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold tracking-wide transition-all shadow-[0_0_16px_rgba(239,68,68,0.4)] cursor-pointer"
              >
                {isRevoking ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Revoking...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Revoke Access Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
