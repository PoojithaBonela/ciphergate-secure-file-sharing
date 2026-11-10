import { useState, useEffect, useRef } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  X,
  Lock,
  AlertTriangle,
  Eye,
  FileText,
  FileCheck,
  Camera,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Users,
} from 'lucide-react'
import FloatingCameraPreview from './FloatingCameraPreview'
import { useFaceGazeMonitor } from '../../hooks/useFaceGazeMonitor'
import { disposeFaceLandmarker } from '../../services/ai/faceGazeService'

export interface SecureFileViewerProps {
  blob: Blob
  filename: string
  mimeType: string
  fileSize: number
  cameraCheckRequired?: boolean
  onClose: () => void
  onTerminate: (reason: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export default function SecureFileViewer({
  blob,
  filename,
  mimeType,
  fileSize,
  cameraCheckRequired = false,
  onClose,
  onTerminate,
}: SecureFileViewerProps) {
  // Pre-viewing security gate: user must acknowledge security rules before viewing
  const [hasStartedViewing, setHasStartedViewing] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Camera Check state & stream lifecycle
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [isRequestingCamera, setIsRequestingCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Guard against duplicate termination triggers
  const isTerminatedRef = useRef(false)
  const objectUrlRef = useRef<string | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement | null>(null)

  // Centralized single-execution termination routine
  const terminateSession = (reason: string) => {
    if (isTerminatedRef.current) return
    isTerminatedRef.current = true

    stopCameraTracks()

    // Stop MediaPipe processing
    disposeFaceLandmarker()

    // Clear sensitive text content from memory
    setTextContent(null)

    // Revoke object URL immediately to wipe decrypted data from browser memory
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setObjectUrl(null)

    onTerminate(reason)
  }

  // AI-Powered Face & Eye-Gaze Monitoring Hook
  const {
    initializationFeedback,
    stabilizationProgress,
    isInitialFaceReady,
    faceCount,
    isLookingAway,
    isFaceAbsent,
    lookingAwayWarnings,
    multipleFacesWarnings,
    noFaceWarnings,
    activeWarning,
    error: aiError,
  } = useFaceGazeMonitor({
    stream: cameraStream,
    enabled: cameraCheckRequired && Boolean(cameraStream),
    onTerminate: (reason) => {
      terminateSession(reason)
    },
  })

  // Automatically unlock viewer once initial face stabilization passes
  useEffect(() => {
    if (cameraCheckRequired && isInitialFaceReady && !hasStartedViewing) {
      setHasStartedViewing(true)
    }
  }, [cameraCheckRequired, isInitialFaceReady, hasStartedViewing])

  // Bind live stream to preview video during stabilization phase
  useEffect(() => {
    if (previewVideoRef.current && cameraStream) {
      previewVideoRef.current.srcObject = cameraStream
      previewVideoRef.current.play().catch(() => {})
    }
  }, [cameraStream])

  // Keep cameraStreamRef synchronized
  useEffect(() => {
    cameraStreamRef.current = cameraStream
  }, [cameraStream])

  // Explicit camera track shutdown routine
  const stopCameraTracks = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // Ignore
        }
      })
      cameraStreamRef.current = null
      setCameraStream(null)
    }
  }

  // Proper media cleanup on unmount
  useEffect(() => {
    return () => {
      stopCameraTracks()
    }
  }, [])

  const handleClose = () => {
    stopCameraTracks()
    onClose()
  }

  // Request receiver camera access and proceed to stabilization
  const handleStartViewing = async () => {
    if (!cameraCheckRequired) {
      setHasStartedViewing(true)
      return
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported by your browser or environment.')
      return
    }

    setIsRequestingCamera(true)
    setCameraError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })

      // Terminate session if user or hardware terminates camera feed mid-session
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          terminateSession('Camera feed was stopped or disconnected')
        }
      })

      cameraStreamRef.current = stream
      setCameraStream(stream)
      setIsRequestingCamera(false)
    } catch (err: unknown) {
      setIsRequestingCamera(false)
      let message = 'Camera access was denied or failed to initialize.'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          message =
            'Camera permission was denied. The sender requires active camera presence verification to view this document. Please allow camera permissions in your browser settings to continue.'
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          message =
            'No camera was found on your device. A working camera is required to view this transfer.'
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          message =
            'Camera hardware is currently in use by another application. Please close other applications using your camera and try again.'
        } else if (err.name === 'OverconstrainedError') {
          message =
            'No compatible camera matching the required constraints was found.'
        }
      } else if (err instanceof Error) {
        message = err.message
      }
      setCameraError(message)
    }
  }

  // Load preview data once user enters active viewing session
  useEffect(() => {
    if (!hasStartedViewing) return

    let isMounted = true

    // Text / JSON / Markdown preview
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/javascript'
    ) {
      blob
        .text()
        .then((text) => {
          if (isMounted) setTextContent(text)
        })
        .catch(() => {
          if (isMounted) setLoadError('Unable to render text content.')
        })
    } else {
      // Images & PDFs use object URL
      try {
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        if (isMounted) setObjectUrl(url)
      } catch {
        if (isMounted) setLoadError('Unable to generate preview URL.')
      }
    }

    return () => {
      isMounted = false
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [hasStartedViewing, blob, mimeType])

  // Active Security Event Listeners (Tab-switching, window blur, keyboard shortcuts, print suppression)
  useEffect(() => {
    if (!hasStartedViewing) return

    // 1. Tab switching & browser minimization monitoring
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        terminateSession('Tab switch or browser minimized')
      }
    }

    // 2. Window focus loss monitoring
    const handleWindowBlur = () => {
      terminateSession('Window lost focus (external application or switch detected)')
    }

    // 3. Page navigation, tab close, or refresh
    const handlePageHide = () => {
      terminateSession('Page navigation or tab closure')
    }

    // 4. Print action suppression & detection
    const handleBeforePrint = (e: Event) => {
      e.preventDefault()
      terminateSession('Print action detected')
    }

    // 5. Prevent context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    // 6. Prevent drag and drop
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault()
    }

    // 7. Prevent selection and copy
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault()
    }
    const handleSelectStart = (e: Event) => {
      e.preventDefault()
    }

    // 8. Screenshot-related and capture keyboard shortcut traps
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault()
        e.stopPropagation()
        try {
          navigator.clipboard?.writeText('')
        } catch {
          // Ignore clipboard permission errors
        }
        terminateSession('Screenshot shortcut detected (Print Screen)')
        return
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey

      if (isCtrlOrCmd && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        e.stopPropagation()
        terminateSession('Print shortcut detected (Ctrl/Cmd+P)')
        return
      }

      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (
        e.key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key))
      ) {
        e.preventDefault()
        e.stopPropagation()
        terminateSession('Developer inspection shortcut detected')
        return
      }

      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        terminateSession('Screen capture shortcut detected')
        return
      }
    }

    // 9. Inject dynamic CSS print-blocking rule
    const styleEl = document.createElement('style')
    styleEl.id = 'encra-secure-viewer-print-guard'
    styleEl.innerHTML = `
      @media print {
        body, html, #root, * {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
      }
    `
    document.head.appendChild(styleEl)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handlePageHide)
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('contextmenu', handleContextMenu, true)
    document.addEventListener('dragstart', handleDragStart, true)
    document.addEventListener('copy', handleCopy, true)
    document.addEventListener('selectstart', handleSelectStart, true)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handlePageHide)
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      document.removeEventListener('copy', handleCopy, true)
      document.removeEventListener('selectstart', handleSelectStart, true)

      const existingStyle = document.getElementById('encra-secure-viewer-print-guard')
      if (existingStyle) {
        document.head.removeChild(existingStyle)
      }
    }
  }, [hasStartedViewing])

  // Determine if file is visually previewable
  const isImage = mimeType.startsWith('image/')
  const isPdf = mimeType === 'application/pdf'
  const isVideo = mimeType.startsWith('video/')
  const isAudio = mimeType.startsWith('audio/')
  const isText =
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/javascript'
  const isPreviewable = isImage || isPdf || isVideo || isAudio || isText

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md select-none animate-in fade-in duration-200"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* ── STAGE 1: PRE-VIEWING ADVISORY OR INITIAL FACE STABILIZATION GATE ── */}
      {!hasStartedViewing ? (
        <div className="relative w-full max-w-lg rounded-2xl bg-[#0A1220] border border-[#202B3D] p-6 sm:p-8 shadow-[0_0_50px_rgba(41,151,255,0.18)]">
          {cameraCheckRequired && cameraStream ? (
            /* ── INITIAL FACE STABILIZATION VIEW ─────────────────────────── */
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-xl bg-[#2997FF]/15 border border-[#2997FF]/30 text-[#2997FF] flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[#F5F7FA]">
                  AI Face Presence Verification
                </h2>
              </div>

              <p className="text-xs text-[#8CA4C5] max-w-sm mx-auto leading-relaxed">
                MediaPipe is verifying that exactly one authorized viewer is present in front of the screen.
              </p>

              {/* Viewfinder box with live mirror video */}
              <div className="relative w-full max-w-xs h-48 mx-auto rounded-xl overflow-hidden bg-black/80 border-2 border-[#2997FF]/60 shadow-[0_0_30px_rgba(41,151,255,0.25)] flex items-center justify-center">
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1] pointer-events-none"
                />

                {/* Oval face guide overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    className={`w-32 h-40 rounded-[50%] border-2 border-dashed transition-colors duration-300 ${
                      stabilizationProgress > 0 ? 'border-teal-400 bg-teal-400/5' : 'border-[#2997FF]/50'
                    }`}
                  />
                </div>

                {/* Progress pill overlay */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-xs font-mono text-[#F5F7FA] flex items-center gap-1.5 shadow">
                  {stabilizationProgress >= 100 ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                      <span className="text-teal-400">Verified</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-[#2997FF] animate-spin" />
                      <span>{stabilizationProgress}% Verified</span>
                    </>
                  )}
                </div>
              </div>

              {/* Real-time Guidance Feedback */}
              <div className="p-3 rounded-xl bg-[#050913] border border-[#202B3D] min-h-[48px] flex items-center justify-center text-xs">
                {aiError ? (
                  <p className="text-rose-400 font-medium">{aiError}</p>
                ) : (
                  <p className="text-[#2997FF] font-semibold animate-pulse">{initializationFeedback}</p>
                )}
              </div>

              {/* Stabilization Progress Bar */}
              <div className="w-full bg-[#111E30] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#2997FF] to-teal-400 h-full transition-all duration-200"
                  style={{ width: `${stabilizationProgress}%` }}
                />
              </div>

              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 rounded-xl bg-[#111E30] hover:bg-[#162740] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── STANDARD ADVISORY & PERMISSION GATE ───────────────────── */
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-[#2997FF]/15 border border-[#2997FF]/30 text-[#2997FF] flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#F5F7FA]">
                    Secure Preview Mode
                  </h2>
                  <p className="text-xs text-[#8CA4C5]">
                    Strict session monitoring is enforced during viewing.
                  </p>
                </div>
              </div>

              <div className="my-5 p-4 rounded-xl bg-[#050913] border border-[#202B3D] space-y-3 text-xs leading-relaxed">
                <div className="flex items-start gap-2.5 text-[#F5F7FA]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2997FF] mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#2997FF]">Tab & Window Lock:</strong> Switching browser tabs, minimizing the window, or clicking outside will immediately terminate access and erase the decrypted file from memory.
                  </span>
                </div>

                <div className="flex items-start gap-2.5 text-[#F5F7FA]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2997FF] mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#2997FF]">Capture Restrictions:</strong> Right-click, text selection, printing (Ctrl/Cmd+P), and dragging are blocked inside the viewer.
                  </span>
                </div>

                <div className="flex items-start gap-2.5 text-[#8CA4C5] text-[11px] pt-1 border-t border-[#202B3D]/60">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Note: Web browsers cannot block external cameras or operating-system-level tools. Encra enforces browser-level traps and focus monitoring to maximize security.
                  </span>
                </div>
              </div>

              {/* Camera Check Mandatory Notice if enforced */}
              {cameraCheckRequired && (
                <div className="my-4 p-4 rounded-xl bg-[#2997FF]/10 border border-[#2997FF]/30 space-y-2">
                  <div className="flex items-center gap-2 text-[#2997FF]">
                    <Camera className="w-4 h-4 shrink-0" />
                    <span className="font-bold text-xs text-[#F5F7FA]">Camera Check Enforced by Sender</span>
                  </div>
                  <p className="text-xs text-[#8CA4C5] leading-relaxed">
                    The sender requires live camera presence & eye-gaze verification while viewing this document. MediaPipe Face Landmarker analyzes your presence locally in the browser to prevent unauthorized onlookers.
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-teal-400 font-medium pt-1">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Zero-Biometrics: Video and facial landmarks are never stored, recorded, or uploaded.</span>
                  </div>
                </div>
              )}

              {/* Camera Error Alert */}
              {cameraError && (
                <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-in fade-in duration-200">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-rose-200">Camera Access Required</p>
                    <p className="text-xs text-rose-300/90 mt-0.5 leading-relaxed">{cameraError}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#111E30] hover:bg-[#162740] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleStartViewing}
                  disabled={isRequestingCamera}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white text-xs font-semibold tracking-wide transition-all shadow-[0_0_20px_rgba(41,151,255,0.35)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRequestingCamera ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Requesting Camera Access...</span>
                    </>
                  ) : cameraCheckRequired ? (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>{cameraError ? 'Retry Camera Access' : 'Grant Camera Access & View'}</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      <span>Enter Secure Viewing Session</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── STAGE 2: ACTIVE SECURE VIEWPORT ─────────────────────────── */
        <>
          {/* ── PERSISTENT MONITORING STATUS BAR AT THE TOP OF THE SCREEN (Outside secure document viewer) ── */}
          {cameraCheckRequired && (
            <aside
              aria-label="Monitoring Dashboard"
              className="fixed top-0 inset-x-0 z-[60] h-14 bg-[#0A1220]/95 backdrop-blur-md border-b border-[#202B3D] px-3 sm:px-6 flex items-center justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)]"
            >
              {/* Left: Branding & AI Status */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#2997FF]/15 border border-[#2997FF]/30 text-[#2997FF] flex items-center justify-center shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
                <div className="hidden sm:block min-w-0">
                  <p className="text-xs font-bold text-[#F5F7FA] tracking-wide truncate">
                    AI Presence Monitoring
                  </p>
                  <p className="text-[10px] text-[#8CA4C5] truncate">
                    Encra Zero-Knowledge Security
                  </p>
                </div>
              </div>

              {/* Center: The Three Independent Live Counters */}
              <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto py-1">
                {/* Multiple Faces Detected Live Counter */}
                <div
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold tracking-wide transition-all select-none shrink-0 ${
                    multipleFacesWarnings === 0
                      ? 'bg-[#111E30]/90 border-[#202B3D] text-[#8CA4C5]'
                      : multipleFacesWarnings === 1
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                        : multipleFacesWarnings === 2
                          ? 'bg-amber-600/25 border-amber-500/60 text-amber-200 font-bold shadow-[0_0_18px_rgba(245,158,11,0.4)] animate-pulse'
                          : 'bg-rose-500/25 border-rose-500/60 text-rose-200 font-bold shadow-[0_0_18px_rgba(244,63,94,0.4)]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-[#2997FF] shrink-0" />
                  <span className="truncate">Multiple Faces Detected — Warning: {multipleFacesWarnings}/3</span>
                </div>

                {/* Looking Away Live Counter */}
                <div
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold tracking-wide transition-all select-none shrink-0 ${
                    lookingAwayWarnings === 0
                      ? 'bg-[#111E30]/90 border-[#202B3D] text-[#8CA4C5]'
                      : lookingAwayWarnings === 1
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                        : lookingAwayWarnings === 2
                          ? 'bg-amber-600/25 border-amber-500/60 text-amber-200 font-bold shadow-[0_0_18px_rgba(245,158,11,0.4)] animate-pulse'
                          : 'bg-rose-500/25 border-rose-500/60 text-rose-200 font-bold shadow-[0_0_18px_rgba(244,63,94,0.4)]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 text-[#2997FF] shrink-0" />
                  <span className="truncate">Looking Away — Warning: {lookingAwayWarnings}/3</span>
                </div>

                {/* No Face Detected Live Counter */}
                <div
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold tracking-wide transition-all select-none shrink-0 ${
                    noFaceWarnings === 0
                      ? 'bg-[#111E30]/90 border-[#202B3D] text-[#8CA4C5]'
                      : noFaceWarnings === 1
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                        : noFaceWarnings === 2
                          ? 'bg-amber-600/25 border-amber-500/60 text-amber-200 font-bold shadow-[0_0_18px_rgba(245,158,11,0.4)] animate-pulse'
                          : 'bg-rose-500/25 border-rose-500/60 text-rose-200 font-bold shadow-[0_0_18px_rgba(244,63,94,0.4)]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 text-[#2997FF] shrink-0" />
                  <span className="truncate">No Face Detected — Warning: {noFaceWarnings}/3</span>
                </div>
              </div>

              {/* Right: Live Gaze Pill & Close Button */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-white/10 text-[10px] font-mono text-[#8CA4C5]">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      faceCount > 1
                        ? 'bg-rose-500 animate-ping'
                        : isLookingAway || isFaceAbsent
                          ? 'bg-amber-400'
                          : 'bg-teal-400'
                    }`}
                  />
                  <span>
                    {faceCount > 1
                      ? `${faceCount} Faces`
                      : isFaceAbsent
                        ? 'No Face'
                        : isLookingAway
                          ? 'Looking Away'
                          : 'Focused'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded-lg text-[#8CA4C5] hover:text-[#F5F7FA] hover:bg-[#111E30] transition-colors cursor-pointer"
                  title="Close Secure Viewer"
                  aria-label="Close Secure Viewer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </aside>
          )}

          {/* Floating live camera preview: freely draggable across entire viewport via Portal */}
          {cameraCheckRequired && cameraStream && (
            <FloatingCameraPreview
              stream={cameraStream}
              faceCount={faceCount}
              isLookingAway={isLookingAway}
              isFaceAbsent={isFaceAbsent}
              lookingAwayWarnings={lookingAwayWarnings}
              multipleFacesWarnings={multipleFacesWarnings}
              noFaceWarnings={noFaceWarnings}
              monitoringActive={cameraCheckRequired}
            />
          )}

          {/* Active AI Violation Warning Banner: transient 2-second unobtrusive alert */}
          {activeWarning && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] w-[90%] max-w-md p-3.5 rounded-xl bg-[#0A1220]/95 backdrop-blur-md border border-rose-500/60 shadow-[0_0_30px_rgba(244,63,94,0.3)] animate-in slide-in-from-top-3 fade-in duration-200">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-xs text-rose-200">
                      {activeWarning.type === 'multiple_faces'
                        ? 'Multiple People Detected'
                        : activeWarning.type === 'no_face'
                          ? 'No Face Detected'
                          : 'Attention Warning — Looking Away'}
                    </p>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      Warning {activeWarning.warningNumber} of 3
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-300/90 mt-0.5 leading-relaxed">
                    {activeWarning.message}
                  </p>
                  <p className="text-[10px] text-[#8CA4C5] mt-1 font-medium">
                    {activeWarning.warningNumber === 2
                      ? '⚠️ FINAL WARNING: 3rd violation terminates access & wipes decrypted file.'
                      : 'Access will terminate if this category reaches 3/3 warnings.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Secure Document Viewer Container */}
          <div
            ref={viewportRef}
            className={`relative flex flex-col w-full max-w-4xl rounded-2xl bg-[#050913] border border-[#202B3D] shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden ${
              cameraCheckRequired ? 'mt-14 h-[calc(100vh-4.5rem)]' : 'h-[88vh]'
            }`}
          >
            {/* Absence Shield Veil when face is absent */}
            {isFaceAbsent && !activeWarning && (
              <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
                <div className="max-w-md w-full p-6 rounded-2xl bg-[#0A1220] border border-amber-400/40 text-center shadow-[0_0_50px_rgba(251,191,36,0.15)]">
                  <div className="w-12 h-12 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-400 mx-auto mb-3 flex items-center justify-center">
                    <Camera className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-base font-bold text-[#F5F7FA] mb-1">Face Not Detected</h3>
                  <p className="text-xs text-[#8CA4C5] leading-relaxed">
                    Your face is no longer visible in front of the camera. The document is paused to protect confidential contents. Please return in front of the camera to resume viewing.
                  </p>
                </div>
              </div>
            )}

          {/* Header Bar */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-[#0A1220] border-b border-[#202B3D] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0">
                <FileCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F7FA] truncate">
                  {filename}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-[#8CA4C5]">
                  <span>{formatBytes(fileSize)}</span>
                  <span>·</span>
                  <span className="truncate">{mimeType}</span>
                </div>
              </div>
            </div>

            {/* Live Security Monitoring Badge */}
            <div className="flex items-center gap-3">
              {cameraCheckRequired && (
                <div className="hidden md:flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2997FF]/15 border border-[#2997FF]/30 text-[11px] text-[#2997FF] font-semibold">
                    <Camera className="w-3.5 h-3.5" />
                    <span>AI Protected</span>
                  </div>

                  {(lookingAwayWarnings > 0 || multipleFacesWarnings > 0) && (
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-400 font-semibold font-mono">
                      <AlertTriangle className="w-3 h-3" />
                      <span>
                        Gaze: {lookingAwayWarnings}/2 · Faces: {multipleFacesWarnings}/2
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-[11px] text-teal-400 font-semibold shadow-[0_0_12px_rgba(20,184,166,0.15)]">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                <span>Active Protected Session</span>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-lg text-[#8CA4C5] hover:text-[#F5F7FA] hover:bg-[#111E30] transition-colors cursor-pointer"
                title="Close Secure Viewer"
                aria-label="Close Secure Viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Secure Content Area with Security Watermark Overlay */}
          <div className="relative flex-1 bg-[#050913] overflow-auto flex items-center justify-center p-4">
            {/* Repeating Security Watermark Overlay */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center overflow-hidden opacity-10 select-none"
            >
              <div className="w-[200%] h-[200%] rotate-[-25deg] flex flex-wrap content-center justify-center gap-12 font-mono text-xs sm:text-sm text-[#2997FF] tracking-widest font-bold">
                {Array.from({ length: 36 }).map((_, idx) => (
                  <span key={idx}>ENCRA SECURE VIEW • CONFIDENTIAL</span>
                ))}
              </div>
            </div>

            {/* Content Renderer */}
            <div className="relative z-10 max-w-full max-h-full flex items-center justify-center">
              {loadError ? (
                <div className="text-center p-6 text-rose-300 text-xs sm:text-sm">
                  <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                  <p>{loadError}</p>
                </div>
              ) : !isPreviewable ? (
                <div className="text-center p-6 text-[#8CA4C5] text-xs sm:text-sm max-w-md">
                  <FileText className="w-10 h-10 text-[#2997FF] mx-auto mb-3" />
                  <p className="font-semibold text-[#F5F7FA] mb-1">
                    Preview unavailable for this file format.
                  </p>
                  <p className="text-[12px] text-[#8CA4C5]">
                    Direct preview is not supported for this format ({mimeType}). In accordance with Encra security policies, downloading files to local storage is disabled.
                  </p>
                </div>
              ) : isImage && objectUrl ? (
                <img
                  src={objectUrl}
                  alt={filename}
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg pointer-events-none select-none"
                />
              ) : isPdf && objectUrl ? (
                <object
                  data={`${objectUrl}#toolbar=0&navpanes=0`}
                  type="application/pdf"
                  className="w-[80vw] max-w-3xl h-[75vh] rounded-lg border border-[#202B3D] bg-white"
                >
                  <iframe
                    src={`${objectUrl}#toolbar=0&navpanes=0`}
                    title={filename}
                    className="w-full h-full rounded-lg border-0 bg-white"
                  />
                </object>
              ) : mimeType.startsWith('video/') && objectUrl ? (
                <video
                  src={objectUrl}
                  controls
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
                  className="max-w-full max-h-[75vh] rounded-lg shadow-lg"
                />
              ) : mimeType.startsWith('audio/') && objectUrl ? (
                <audio
                  src={objectUrl}
                  controls
                  controlsList="nodownload"
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full max-w-md p-4 rounded-xl bg-[#0A1220] border border-[#202B3D]"
                />
              ) : isText && textContent !== null ? (
                <pre
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full max-w-3xl max-h-[75vh] p-5 rounded-xl bg-[#0A1220] border border-[#202B3D] text-[#F5F7FA] text-xs font-mono overflow-auto whitespace-pre-wrap select-none leading-relaxed"
                >
                  {textContent}
                </pre>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[#8CA4C5]">
                  <span className="w-4 h-4 border-2 border-[#2997FF] border-t-transparent rounded-full animate-spin" />
                  <span>Preparing protected preview...</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer Security Notice Banner */}
          <div className="px-4 py-2 bg-[#0A1220] border-t border-[#202B3D] flex items-center justify-between text-[11px] text-[#8CA4C5] shrink-0">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#2997FF]" />
              <span>Right-click, text copy, and print suppressed. Leaving this window terminates viewing.</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-teal-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Active Focus Lock</span>
            </div>
          </div>
        </div>
      </>
    )}
  </div>
)
}
