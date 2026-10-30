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
} from 'lucide-react'

export interface SecureFileViewerProps {
  blob: Blob
  filename: string
  mimeType: string
  fileSize: number
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
  onClose,
  onTerminate,
}: SecureFileViewerProps) {
  // Pre-viewing security gate: user must acknowledge security rules before viewing
  const [hasStartedViewing, setHasStartedViewing] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Guard against duplicate termination triggers
  const isTerminatedRef = useRef(false)
  const objectUrlRef = useRef<string | null>(null)

  // Centralized single-execution termination routine
  const terminateSession = (reason: string) => {
    if (isTerminatedRef.current) return
    isTerminatedRef.current = true

    // Revoke object URL immediately to wipe decrypted data from browser memory
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    onTerminate(reason)
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

    // 2. Window focus loss monitoring (e.g. Alt-Tab, clicking external application, or launching Snipping Tool)
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
      // PrintScreen key
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

      // Ctrl+P / Cmd+P (Print)
      if (isCtrlOrCmd && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        e.stopPropagation()
        terminateSession('Print shortcut detected (Ctrl/Cmd+P)')
        return
      }

      // Ctrl+S / Cmd+S (Save page)
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Ctrl+C / Cmd+C / Ctrl+X (Copy/Cut)
      if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // DevTools shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C)
      if (
        e.key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key))
      ) {
        e.preventDefault()
        e.stopPropagation()
        terminateSession('Developer inspection shortcut detected')
        return
      }

      // macOS screenshot shortcuts if detectable (Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5)
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

    // Register active listeners
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
      {/* ── STAGE 1: PRE-VIEWING SECURITY ADVISORY & WARNING ───────────── */}
      {!hasStartedViewing ? (
        <div className="relative w-full max-w-lg rounded-2xl bg-[#0A1220] border border-[#202B3D] p-6 sm:p-8 shadow-[0_0_50px_rgba(41,151,255,0.18)]">
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

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#111E30] hover:bg-[#162740] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => setHasStartedViewing(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white text-xs font-semibold tracking-wide transition-all shadow-[0_0_20px_rgba(41,151,255,0.35)] cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span>Enter Secure Viewing Session</span>
            </button>
          </div>
        </div>
      ) : (
        /* ── STAGE 2: ACTIVE SECURE VIEWPORT ─────────────────────────── */
        <div className="relative flex flex-col w-full max-w-4xl h-[88vh] rounded-2xl bg-[#050913] border border-[#202B3D] shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden">
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
              <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-[11px] text-teal-400 font-semibold shadow-[0_0_12px_rgba(20,184,166,0.15)]">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                <span>Active Protected Session</span>
              </div>

              <button
                type="button"
                onClick={onClose}
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
              <div
                className="w-[200%] h-[200%] rotate-[-25deg] flex flex-wrap content-center justify-center gap-12 font-mono text-xs sm:text-sm text-[#2997FF] tracking-widest font-bold"
              >
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
                    Direct visual preview not supported for this format.
                  </p>
                  <p className="text-[12px] text-[#8CA4C5]">
                    This file ({mimeType}) can be securely downloaded via the main decryption panel.
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
      )}
    </div>
  )
}
