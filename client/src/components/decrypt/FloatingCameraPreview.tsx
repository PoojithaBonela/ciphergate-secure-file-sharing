import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Camera, GripHorizontal, ShieldCheck, AlertTriangle, Users } from 'lucide-react'

export interface FloatingCameraPreviewProps {
  stream: MediaStream | null
  faceCount?: number
  isLookingAway?: boolean
  isFaceAbsent?: boolean
  lookingAwayWarnings?: number
  multipleFacesWarnings?: number
  noFaceWarnings?: number
  monitoringActive?: boolean
}

const PREVIEW_WIDTH = 210
const PREVIEW_HEIGHT = 160

export default function FloatingCameraPreview({
  stream,
  faceCount = 1,
  isLookingAway = false,
  isFaceAbsent = false,
  lookingAwayWarnings = 0,
  multipleFacesWarnings = 0,
  noFaceWarnings = 0,
  monitoringActive = false,
}: FloatingCameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  // Floating coordinates in fixed viewport coordinates
  // Initialized to top-right corner of viewport, safely below the top status bar (y: 72)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      const defaultX = Math.max(16, window.innerWidth - PREVIEW_WIDTH - 24)
      return { x: defaultX, y: 72 }
    }
    return { x: 20, y: 72 }
  })

  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number }>({
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0,
  })

  // Keep camera preview within viewport bounds on browser window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const maxX = Math.max(8, window.innerWidth - PREVIEW_WIDTH - 8)
        const maxY = Math.max(8, window.innerHeight - PREVIEW_HEIGHT - 8)
        return {
          x: Math.min(Math.max(prev.x, 8), maxX),
          y: Math.min(Math.max(prev.y, 8), maxY),
        }
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Robust video stream binding routine:
  // Sets srcObject, enforces muted & playsinline, and guarantees playback initialization
  const attachVideoSource = useCallback(
    (videoEl: HTMLVideoElement | null) => {
      if (!videoEl) return
      videoRef.current = videoEl

      if (!stream) {
        if (videoEl.srcObject) {
          videoEl.srcObject = null
        }
        return
      }

      // Check if video tracks are active and enabled
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true
      })

      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream
      }

      videoEl.muted = true
      videoEl.defaultMuted = true
      videoEl.playsInline = true
      videoEl.autoplay = true
      videoEl.setAttribute('muted', '')
      videoEl.setAttribute('playsinline', '')
      videoEl.setAttribute('autoplay', '')

      const attemptPlay = () => {
        if (videoEl.paused) {
          videoEl.play().catch((playErr) => {
            console.warn('[FloatingCameraPreview] Play request pending/suppressed:', playErr)
          })
        }
      }

      if (videoEl.readyState >= 1) {
        attemptPlay()
      } else {
        videoEl.onloadedmetadata = () => {
          attemptPlay()
        }
      }
    },
    [stream]
  )

  // Re-run video attachment if stream instance changes
  useEffect(() => {
    if (videoRef.current) {
      attachVideoSource(videoRef.current)
    }
  }, [stream, attachVideoSource])

  // Dragging handlers: mouse & touch supported via Pointer Events
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()

    isDraggingRef.current = true
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: position.x,
      startY: position.y,
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Safe fallback
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    e.stopPropagation()

    const deltaX = e.clientX - dragStartRef.current.pointerX
    const deltaY = e.clientY - dragStartRef.current.pointerY

    let newX = dragStartRef.current.startX + deltaX
    let newY = dragStartRef.current.startY + deltaY

    // Constrain to browser viewport boundaries
    const minX = 8
    const maxX = Math.max(minX, window.innerWidth - PREVIEW_WIDTH - 8)
    const minY = 8
    const maxY = Math.max(minY, window.innerHeight - PREVIEW_HEIGHT - 8)

    newX = Math.min(Math.max(newX, minX), maxX)
    newY = Math.min(Math.max(newY, minY), maxY)

    setPosition({ x: newX, y: newY })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      e.stopPropagation()
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // Safe fallback
      }
    }
  }

  const totalWarnings = lookingAwayWarnings + multipleFacesWarnings + noFaceWarnings

  // Real-time status configuration
  let statusColor = 'bg-teal-400'
  let statusText = '1 Face • Focused'

  if (monitoringActive) {
    if (faceCount > 1) {
      statusColor = 'bg-rose-500'
      statusText = `Multiple Faces (${faceCount})`
    } else if (faceCount === 0 || isFaceAbsent) {
      statusColor = 'bg-amber-400'
      statusText = 'No Face'
    } else if (isLookingAway) {
      statusColor = 'bg-amber-400'
      statusText = 'Looking Away'
    }
  }

  if (typeof document === 'undefined') {
    return null
  }

  // Render via React Portal directly into document.body to ensure free movement anywhere across the viewport
  return createPortal(
    <div
      ref={previewRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: `${PREVIEW_WIDTH}px`,
        zIndex: 9999,
      }}
      className={`select-none touch-none cursor-grab active:cursor-grabbing rounded-xl bg-[#0A1220]/95 backdrop-blur-md border p-2 shadow-[0_8px_32px_rgba(0,0,0,0.85)] transition-shadow ${faceCount > 1
          ? 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.35)]'
          : isLookingAway || isFaceAbsent
            ? 'border-amber-400 shadow-[0_0_22px_rgba(251,191,36,0.3)]'
            : 'border-[#2997FF]/50 shadow-[0_0_22px_rgba(41,151,255,0.25)] hover:shadow-[0_0_30px_rgba(41,151,255,0.4)]'
        }`}
      title="Live Camera Feed & AI Monitoring (Freely draggable across screen)"
    >
      {/* Drag Header & Status Indicator */}
      <div className="flex items-center justify-between px-1.5 py-1 mb-1.5 text-[10px] text-[#8CA4C5] font-semibold border-b border-[#202B3D]/80">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor}`}
            />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColor}`} />
          </span>
          <span className="text-[#F5F7FA] font-medium tracking-wide truncate">{statusText}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`font-mono text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
              totalWarnings === 0
                ? 'bg-[#111E30] text-[#8CA4C5] border-[#202B3D]'
                : totalWarnings === 1
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                  : 'bg-rose-500/25 text-rose-300 border-rose-500/50 font-bold'
            }`}
            title={`Multiple Faces: ${multipleFacesWarnings}/3 · Looking Away: ${lookingAwayWarnings}/3 · No Face: ${noFaceWarnings}/3`}
          >
            F:{multipleFacesWarnings}/3 G:{lookingAwayWarnings}/3 N:{noFaceWarnings}/3
          </span>
          <GripHorizontal className="w-3.5 h-3.5 text-[#8CA4C5]/80" />
        </div>
      </div>

      {/* Video Viewport: Displays the actual live camera feed */}
      <div className="relative w-full h-[116px] rounded-lg overflow-hidden bg-black border border-[#202B3D]/60 flex items-center justify-center">
        {stream ? (
          <video
            ref={attachVideoSource}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(e) => {
              const el = e.currentTarget
              el.play().catch(() => { })
            }}
            onCanPlay={(e) => {
              const el = e.currentTarget
              el.play().catch(() => { })
            }}
            className="w-full h-full object-cover scale-x-[-1] block pointer-events-none"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 text-center p-2 text-[10px] text-[#8CA4C5]">
            <Camera className="w-4 h-4 text-[#2997FF] animate-pulse" />
            <span>Connecting Camera...</span>
          </div>
        )}

        {/* Warning Indicator Pill if warnings active */}
        {totalWarnings > 0 && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-rose-500/95 text-white text-[9px] flex items-center gap-1 font-bold shadow-md">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>
              {totalWarnings} {totalWarnings === 1 ? 'Warning' : 'Warnings'}
            </span>
          </div>
        )}

        {/* Face Count Overlay if multiple faces detected */}
        {faceCount > 1 && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-rose-500/95 text-white text-[9px] flex items-center gap-1 font-bold shadow-md animate-pulse">
            <Users className="w-2.5 h-2.5" />
            <span>{faceCount} Faces</span>
          </div>
        )}

        {/* Protected Session Pill */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm border border-white/10 text-[9px] text-[#2997FF] flex items-center gap-1 font-mono">
          <ShieldCheck className="w-2.5 h-2.5 text-teal-400" />
          <span>Local AI</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
