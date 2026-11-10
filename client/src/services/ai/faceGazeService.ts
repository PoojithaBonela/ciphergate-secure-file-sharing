import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision'

const WASM_CDN_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let landmarkerInstance: FaceLandmarker | null = null
let initializationPromise: Promise<FaceLandmarker> | null = null

export interface FaceGazeAnalysis {
  faceCount: number
  isFacePresent: boolean
  isLookingTowardsScreen: boolean
  isLookingAway: boolean
  isBlinking: boolean
  headYawRatio: number
  headPitchRatio: number
  eyeGazeScore: number
  confidence: number
}

/**
 * Initializes and caches the MediaPipe FaceLandmarker instance.
 * Attempts GPU acceleration first, gracefully falling back to CPU if unavailable.
 */
export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerInstance) {
    return landmarkerInstance
  }

  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_CDN_URL)

      let landmarker: FaceLandmarker
      try {
        landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 5,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        })
      } catch (gpuErr) {
        console.warn('[MediaPipe] GPU delegate unavailable, falling back to CPU delegate:', gpuErr)
        landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 5,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        })
      }

      landmarkerInstance = landmarker
      return landmarker
    } catch (err) {
      initializationPromise = null
      throw err
    }
  })()

  return initializationPromise
}

/**
 * Cleans up and frees the active FaceLandmarker instance.
 */
export function disposeFaceLandmarker(): void {
  if (landmarkerInstance) {
    try {
      landmarkerInstance.close()
    } catch (e) {
      console.warn('[MediaPipe] Error closing FaceLandmarker:', e)
    }
    landmarkerInstance = null
    initializationPromise = null
  }
}

/**
 * Analyzes landmarks and blendshapes from FaceLandmarkerResult.
 * Evaluates head pose (yaw, pitch) and approximate eye gaze direction,
 * while ignoring normal blinks and natural small eye movements.
 */
export function analyzeFaceLandmarks(result: FaceLandmarkerResult): FaceGazeAnalysis {
  const faces = result.faceLandmarks || []
  const faceCount = faces.length

  if (faceCount === 0) {
    return {
      faceCount: 0,
      isFacePresent: false,
      isLookingTowardsScreen: false,
      isLookingAway: false,
      isBlinking: false,
      headYawRatio: 0,
      headPitchRatio: 0,
      eyeGazeScore: 0,
      confidence: 0,
    }
  }

  const primaryFace = faces[0]

  // Key landmark indices:
  // 1: Nose tip
  // 33: Left eye outer corner
  // 263: Right eye outer corner
  // 10: Forehead top
  // 152: Chin bottom
  const nose = primaryFace[1] || { x: 0.5, y: 0.5, z: 0 }
  const leftEyeOuter = primaryFace[33] || { x: 0.4, y: 0.4, z: 0 }
  const rightEyeOuter = primaryFace[263] || { x: 0.6, y: 0.4, z: 0 }
  const forehead = primaryFace[10] || { x: 0.5, y: 0.2, z: 0 }
  const chin = primaryFace[152] || { x: 0.5, y: 0.8, z: 0 }

  // Horizontal Head Yaw calculation:
  // Midpoint between eye corners
  const eyeCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2
  const eyeSpan = Math.abs(rightEyeOuter.x - leftEyeOuter.x) || 0.001
  // Deviation of nose tip from horizontal eye center, normalized by eye span
  const headYawRatio = (nose.x - eyeCenterX) / eyeSpan

  // Vertical Head Pitch calculation:
  const eyeCenterY = (leftEyeOuter.y + rightEyeOuter.y) / 2
  const faceHeight = Math.abs(chin.y - forehead.y) || 0.001
  // Vertical position of nose relative to eye level, normalized by face height
  const headPitchRatio = (nose.y - eyeCenterY) / faceHeight

  // Blendshapes analysis if available
  let isBlinking = false
  let eyeLookLeft = 0
  let eyeLookRight = 0
  let eyeLookUp = 0
  let eyeLookDown = 0

  if (result.faceBlendshapes && result.faceBlendshapes[0]?.categories) {
    const categories = result.faceBlendshapes[0].categories
    const scoreMap: Record<string, number> = {}
    for (let i = 0; i < categories.length; i++) {
      scoreMap[categories[i].categoryName] = categories[i].score
    }

    const blinkLeft = scoreMap['eyeBlinkLeft'] || 0
    const blinkRight = scoreMap['eyeBlinkRight'] || 0
    const avgBlink = (blinkLeft + blinkRight) / 2
    isBlinking = avgBlink > 0.65

    // Eye gaze direction deviations
    const lookOutLeft = scoreMap['eyeLookOutLeft'] || 0
    const lookInLeft = scoreMap['eyeLookInLeft'] || 0
    const lookOutRight = scoreMap['eyeLookOutRight'] || 0
    const lookInRight = scoreMap['eyeLookInRight'] || 0
    const lookUpLeft = scoreMap['eyeLookUpLeft'] || 0
    const lookUpRight = scoreMap['eyeLookUpRight'] || 0
    const lookDownLeft = scoreMap['eyeLookDownLeft'] || 0
    const lookDownRight = scoreMap['eyeLookDownRight'] || 0

    eyeLookLeft = Math.max(lookOutLeft, lookInRight)
    eyeLookRight = Math.max(lookInLeft, lookOutRight)
    eyeLookUp = (lookUpLeft + lookUpRight) / 2
    eyeLookDown = (lookDownLeft + lookDownRight) / 2
  }

  // Combined eye gaze deviation score (0 = focused center, higher = gazing away)
  const eyeGazeScore = Math.max(eyeLookLeft, eyeLookRight, eyeLookUp * 0.9, eyeLookDown * 0.8)

  // Thresholds for looking away:
  // 1. Head yaw turned noticeably (e.g. looking left/right past monitor edge)
  const isHeadYawAway = Math.abs(headYawRatio) > 0.28

  // 2. Head pitch turned noticeably (e.g. looking down at phone or up at ceiling)
  // Standard straight pitch ratio is ~0.12 to ~0.25
  const isHeadPitchAway = headPitchRatio < 0.06 || headPitchRatio > 0.38

  // 3. Eyes turned away while head is still (calibrated for real-world gaze deviation)
  const isEyeGazeAway = eyeGazeScore > 0.38 && !isBlinking

  // Receiver is considered looking away in this instantaneous frame if head or eyes are turned away
  // (and user is not merely blinking)
  const isLookingAway = (isHeadYawAway || isHeadPitchAway || isEyeGazeAway) && !isBlinking
  const isLookingTowardsScreen = !isLookingAway

  return {
    faceCount,
    isFacePresent: true,
    isLookingTowardsScreen,
    isLookingAway,
    isBlinking,
    headYawRatio,
    headPitchRatio,
    eyeGazeScore,
    confidence: 1.0,
  }
}

