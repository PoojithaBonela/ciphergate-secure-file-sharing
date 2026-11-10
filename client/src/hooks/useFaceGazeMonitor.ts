import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getFaceLandmarker,
  disposeFaceLandmarker,
  analyzeFaceLandmarks,
  FaceGazeAnalysis,
} from '../services/ai/faceGazeService'
import { FaceLandmarker } from '@mediapipe/tasks-vision'

export interface WarningAlert {
  type: 'looking_away' | 'multiple_faces' | 'no_face'
  warningNumber: number
  message: string
}

export interface UseFaceGazeMonitorOptions {
  stream: MediaStream | null
  enabled: boolean
  onTerminate: (reason: string) => void
}

export interface UseFaceGazeMonitorReturn {
  status: 'idle' | 'initializing' | 'stabilizing' | 'active' | 'error'
  initializationFeedback: string
  stabilizationProgress: number
  isInitialFaceReady: boolean
  faceCount: number
  isLookingAway: boolean
  isFaceAbsent: boolean
  lookingAwayWarnings: number
  multipleFacesWarnings: number
  noFaceWarnings: number
  activeWarning: WarningAlert | null
  dismissActiveWarning: () => void
  error: string | null
}

const INFERENCE_INTERVAL_MS = 180
const STABILIZATION_REQUIRED_FRAMES = 8 // ~1.4 seconds of single face looking forward
const MULTIPLE_FACES_THRESHOLD_FRAMES = 2 // ~360ms of sustained multiple faces
const LOOKING_AWAY_THRESHOLD_FRAMES = 2 // ~360ms of sustained looking away
const NO_FACE_THRESHOLD_FRAMES = 2 // ~360ms of no face detected

export function useFaceGazeMonitor({
  stream,
  enabled,
  onTerminate,
}: UseFaceGazeMonitorOptions): UseFaceGazeMonitorReturn {
  const [status, setStatus] = useState<'idle' | 'initializing' | 'stabilizing' | 'active' | 'error'>('idle')
  const [initializationFeedback, setInitializationFeedback] = useState('Position your face in front of the camera.')
  const [stabilizationProgress, setStabilizationProgress] = useState(0)
  const [isInitialFaceReady, setIsInitialFaceReady] = useState(false)
  const [faceCount, setFaceCount] = useState(0)
  const [isLookingAway, setIsLookingAway] = useState(false)
  const [isFaceAbsent, setIsFaceAbsent] = useState(false)
  const [lookingAwayWarnings, setLookingAwayWarnings] = useState(0)
  const [multipleFacesWarnings, setMultipleFacesWarnings] = useState(0)
  const [noFaceWarnings, setNoFaceWarnings] = useState(0)
  const [activeWarning, setActiveWarning] = useState<WarningAlert | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Mutable refs for continuous tracking across frames
  const isTerminatedRef = useRef(false)
  const consecutiveGoodFramesRef = useRef(0)
  const sustainedMultipleFacesRef = useRef(0)
  const isMultipleFacesIncidentActiveRef = useRef(false)

  const sustainedLookingAwayRef = useRef(0)
  const isLookingAwayIncidentActiveRef = useRef(false)

  const sustainedNoFaceRef = useRef(0)
  const isNoFaceIncidentActiveRef = useRef(false)

  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const animationFrameIdRef = useRef<number | null>(null)
  const lastInferenceTimeRef = useRef<number>(0)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Screen alert is shown for strictly 2 seconds as requested, avoiding view disturbance
  const showWarningWithTimeout = useCallback((warning: WarningAlert) => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
    }
    setActiveWarning(warning)
    warningTimerRef.current = setTimeout(() => {
      setActiveWarning(null)
      warningTimerRef.current = null
    }, 2000)
  }, [])

  const dismissActiveWarning = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
    setActiveWarning(null)
  }, [])

  // Safely trigger termination once
  const triggerTermination = useCallback((reason: string) => {
    if (isTerminatedRef.current) return
    isTerminatedRef.current = true
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current)
      animationFrameIdRef.current = null
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
    setStatus('error')
    onTerminate(reason)
  }, [onTerminate])

  // Setup hidden video element connected to camera stream
  useEffect(() => {
    if (!enabled || !stream) {
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = null
        videoElementRef.current = null
      }
      return
    }

    const video = document.createElement('video')
    video.autoplay = true
    video.playsInline = true
    video.muted = true
    video.srcObject = stream
    video.style.position = 'fixed'
    video.style.top = '-9999px'
    video.style.left = '-9999px'
    video.style.opacity = '0'
    video.style.pointerEvents = 'none'
    video.style.width = '320px'
    video.style.height = '240px'
    document.body.appendChild(video)
    videoElementRef.current = video

    video.play().catch((playErr) => {
      console.warn('[useFaceGazeMonitor] Video play error:', playErr)
    })

    return () => {
      video.pause()
      video.srcObject = null
      if (video.parentNode) {
        video.parentNode.removeChild(video)
      }
      videoElementRef.current = null
    }
  }, [enabled, stream])

  // Initialize MediaPipe FaceLandmarker and run detection loop
  useEffect(() => {
    if (!enabled || !stream) {
      setStatus('idle')
      return
    }

    let isCancelled = false
    setStatus('initializing')
    setError(null)

    getFaceLandmarker()
      .then((landmarker) => {
        if (isCancelled) return
        landmarkerRef.current = landmarker
        setStatus('stabilizing')
        setInitializationFeedback('Position your face in front of the camera.')

        // Start inference loop
        const processFrame = () => {
          if (isCancelled || isTerminatedRef.current) return

          const now = performance.now()
          const timeSinceLast = now - lastInferenceTimeRef.current

          if (timeSinceLast >= INFERENCE_INTERVAL_MS) {
            const video = videoElementRef.current
            if (video && video.readyState >= 2 && landmarkerRef.current) {
              try {
                const results = landmarkerRef.current.detectForVideo(video, now)
                lastInferenceTimeRef.current = now

                const analysis: FaceGazeAnalysis = analyzeFaceLandmarks(results)
                setFaceCount(analysis.faceCount)
                setIsLookingAway(analysis.isLookingAway)

                // ── MODE 1: INITIAL STABILIZATION (Pre-viewing lock) ─────────────
                if (!isInitialFaceReady) {
                  if (analysis.faceCount === 0) {
                    consecutiveGoodFramesRef.current = 0
                    setStabilizationProgress(0)
                    setInitializationFeedback('Please position your face in front of the camera.')
                  } else if (analysis.faceCount > 1) {
                    consecutiveGoodFramesRef.current = 0
                    setStabilizationProgress(0)
                    setInitializationFeedback(
                      `Multiple faces detected (${analysis.faceCount}). Please ensure you are the only person in frame.`
                    )
                  } else if (analysis.isLookingAway) {
                    consecutiveGoodFramesRef.current = Math.max(0, consecutiveGoodFramesRef.current - 1)
                    setStabilizationProgress(
                      Math.round((consecutiveGoodFramesRef.current / STABILIZATION_REQUIRED_FRAMES) * 100)
                    )
                    setInitializationFeedback('Please look directly towards the screen to unlock document.')
                  } else {
                    // Exactly 1 face looking towards screen
                    consecutiveGoodFramesRef.current += 1
                    const progress = Math.min(
                      100,
                      Math.round((consecutiveGoodFramesRef.current / STABILIZATION_REQUIRED_FRAMES) * 100)
                    )
                    setStabilizationProgress(progress)
                    setInitializationFeedback(`Face verified. Hold steady (${progress}%)...`)

                    if (consecutiveGoodFramesRef.current >= STABILIZATION_REQUIRED_FRAMES) {
                      setIsInitialFaceReady(true)
                      setStatus('active')
                    }
                  }
                } else {
                  // ── MODE 2: ACTIVE SECURE VIEWING MONITORING ───────────────────

                  // 1. Multiple Faces Detection & Warning Logic
                  if (analysis.faceCount > 1) {
                    sustainedMultipleFacesRef.current += 1

                    if (sustainedMultipleFacesRef.current >= MULTIPLE_FACES_THRESHOLD_FRAMES) {
                      if (!isMultipleFacesIncidentActiveRef.current) {
                        isMultipleFacesIncidentActiveRef.current = true

                        setMultipleFacesWarnings((prev) => {
                          const nextCount = prev + 1
                          if (nextCount === 1) {
                            showWarningWithTimeout({
                              type: 'multiple_faces',
                              warningNumber: 1,
                              message:
                                'Multiple faces detected in frame. Please ensure you are the only person viewing this document.',
                            })
                          } else if (nextCount === 2) {
                            showWarningWithTimeout({
                              type: 'multiple_faces',
                              warningNumber: 2,
                              message:
                                'Multiple faces detected again. Final warning before session termination.',
                            })
                          }
                          if (nextCount >= 3) {
                            triggerTermination(
                              'Viewing session terminated: 3/3 Multiple Faces violations confirmed.'
                            )
                          }
                          return nextCount
                        })
                      }
                    }
                  } else {
                    sustainedMultipleFacesRef.current = 0
                    if (isMultipleFacesIncidentActiveRef.current && analysis.faceCount === 1) {
                      // Immediate unlatch when single compliant face is present
                      isMultipleFacesIncidentActiveRef.current = false
                    }
                  }

                  // 2. No Face Detected Warning Logic
                  if (analysis.faceCount === 0) {
                    sustainedNoFaceRef.current += 1
                    setIsFaceAbsent(true)

                    if (sustainedNoFaceRef.current >= NO_FACE_THRESHOLD_FRAMES) {
                      if (!isNoFaceIncidentActiveRef.current) {
                        isNoFaceIncidentActiveRef.current = true

                        setNoFaceWarnings((prev) => {
                          const nextCount = prev + 1
                          if (nextCount === 1) {
                            showWarningWithTimeout({
                              type: 'no_face',
                              warningNumber: 1,
                              message:
                                'No face detected in front of camera. Please face the screen to continue viewing.',
                            })
                          } else if (nextCount === 2) {
                            showWarningWithTimeout({
                              type: 'no_face',
                              warningNumber: 2,
                              message:
                                'No face detected again. Final warning before session termination.',
                            })
                          }
                          if (nextCount >= 3) {
                            triggerTermination(
                              'Viewing session terminated: 3/3 No Face Detected violations confirmed.'
                            )
                          }
                          return nextCount
                        })
                      }
                    }
                  } else {
                    sustainedNoFaceRef.current = 0
                    setIsFaceAbsent(false)
                    if (isNoFaceIncidentActiveRef.current) {
                      // Immediate unlatch as soon as face returns
                      isNoFaceIncidentActiveRef.current = false
                    }
                  }

                  // 3. Eye-Gaze Monitoring Logic (Looking Away)
                  if (analysis.faceCount === 1 && analysis.isLookingAway) {
                    sustainedLookingAwayRef.current += 1

                    if (sustainedLookingAwayRef.current >= LOOKING_AWAY_THRESHOLD_FRAMES) {
                      if (!isLookingAwayIncidentActiveRef.current) {
                        isLookingAwayIncidentActiveRef.current = true

                        setLookingAwayWarnings((prev) => {
                          const nextCount = prev + 1
                          if (nextCount === 1) {
                            showWarningWithTimeout({
                              type: 'looking_away',
                              warningNumber: 1,
                              message:
                                'Please keep your eyes on the document. Looking away detected.',
                            })
                          } else if (nextCount === 2) {
                            showWarningWithTimeout({
                              type: 'looking_away',
                              warningNumber: 2,
                              message:
                                'Looking away detected again. Final warning before session termination.',
                            })
                          }
                          if (nextCount >= 3) {
                            triggerTermination(
                              'Viewing session terminated: 3/3 Looking Away violations confirmed.'
                            )
                          }
                          return nextCount
                        })
                      }
                    }
                  } else if (analysis.faceCount === 1 && !analysis.isLookingAway) {
                    sustainedLookingAwayRef.current = 0
                    if (isLookingAwayIncidentActiveRef.current) {
                      // Immediate unlatch as soon as user returns gaze to screen
                      isLookingAwayIncidentActiveRef.current = false
                    }
                  }
                }
              } catch (inferenceErr) {
                console.warn('[useFaceGazeMonitor] Inference cycle error:', inferenceErr)
              }
            }
          }

          animationFrameIdRef.current = requestAnimationFrame(processFrame)
        }

        animationFrameIdRef.current = requestAnimationFrame(processFrame)
      })
      .catch((initErr) => {
        if (isCancelled) return
        console.error('[useFaceGazeMonitor] Initialization failed:', initErr)
        setStatus('error')
        const msg = initErr instanceof Error ? initErr.message : 'Failed to initialize AI face monitoring.'
        setError(msg)
      })

    return () => {
      isCancelled = true
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
        animationFrameIdRef.current = null
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current)
        warningTimerRef.current = null
      }
      disposeFaceLandmarker()
      landmarkerRef.current = null
    }
  }, [enabled, stream, isInitialFaceReady, triggerTermination, showWarningWithTimeout])

  return {
    status,
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
    dismissActiveWarning,
    error,
  }
}

