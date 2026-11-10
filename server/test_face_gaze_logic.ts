import assert from 'node:assert'

console.log('\n======================================================')
console.log('   ENCRA 3.0: MEDIAPIPE FACE & EYE MONITORING TEST')
console.log('======================================================\n')

// ── TEST 1: Face and Gaze Analysis Math Verification ────────────────
interface Point3D {
  x: number
  y: number
  z: number
}

function analyzeFaceLandmarksMock(
  faces: Point3D[][],
  blendshapes?: Record<string, number>
) {
  const faceCount = faces.length
  if (faceCount === 0) {
    return {
      faceCount: 0,
      isFacePresent: false,
      isLookingTowardsScreen: false,
      isLookingAway: false,
      isBlinking: false,
    }
  }

  const primaryFace = faces[0]
  const nose = primaryFace[1] || { x: 0.5, y: 0.5, z: 0 }
  const leftEyeOuter = primaryFace[33] || { x: 0.4, y: 0.4, z: 0 }
  const rightEyeOuter = primaryFace[263] || { x: 0.6, y: 0.4, z: 0 }
  const forehead = primaryFace[10] || { x: 0.5, y: 0.2, z: 0 }
  const chin = primaryFace[152] || { x: 0.5, y: 0.8, z: 0 }

  const eyeCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2
  const eyeSpan = Math.abs(rightEyeOuter.x - leftEyeOuter.x) || 0.001
  const headYawRatio = (nose.x - eyeCenterX) / eyeSpan

  const eyeCenterY = (leftEyeOuter.y + rightEyeOuter.y) / 2
  const faceHeight = Math.abs(chin.y - forehead.y) || 0.001
  const headPitchRatio = (nose.y - eyeCenterY) / faceHeight

  let isBlinking = false
  let eyeGazeScore = 0

  if (blendshapes) {
    const blinkLeft = blendshapes['eyeBlinkLeft'] || 0
    const blinkRight = blendshapes['eyeBlinkRight'] || 0
    const avgBlink = (blinkLeft + blinkRight) / 2
    isBlinking = avgBlink > 0.65

    const lookOutLeft = blendshapes['eyeLookOutLeft'] || 0
    const lookInLeft = blendshapes['eyeLookInLeft'] || 0
    const lookOutRight = blendshapes['eyeLookOutRight'] || 0
    const lookInRight = blendshapes['eyeLookInRight'] || 0
    const lookUpLeft = blendshapes['eyeLookUpLeft'] || 0
    const lookUpRight = blendshapes['eyeLookUpRight'] || 0
    const lookDownLeft = blendshapes['eyeLookDownLeft'] || 0
    const lookDownRight = blendshapes['eyeLookDownRight'] || 0

    const eyeLookLeft = Math.max(lookOutLeft, lookInRight)
    const eyeLookRight = Math.max(lookInLeft, lookOutRight)
    const eyeLookUp = (lookUpLeft + lookUpRight) / 2
    const eyeLookDown = (lookDownLeft + lookDownRight) / 2
    eyeGazeScore = Math.max(eyeLookLeft, eyeLookRight, eyeLookUp * 0.9, eyeLookDown * 0.8)
  }

  const isHeadYawAway = Math.abs(headYawRatio) > 0.28
  const isHeadPitchAway = headPitchRatio < 0.06 || headPitchRatio > 0.38
  const isEyeGazeAway = eyeGazeScore > 0.38 && !isBlinking

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
  }
}

// 1A. Zero faces (absent)
const resEmpty = analyzeFaceLandmarksMock([])
assert.strictEqual(resEmpty.faceCount, 0)
assert.strictEqual(resEmpty.isFacePresent, false)
assert.strictEqual(resEmpty.isLookingTowardsScreen, false)
console.log('✓ TEST 1A PASSED: Zero faces correctly detected as absent.')

// 1B. Normal single face looking towards screen
const normalFace: Point3D[] = []
for (let i = 0; i < 478; i++) normalFace.push({ x: 0.5, y: 0.5, z: 0 })
normalFace[1] = { x: 0.50, y: 0.50, z: 0 } // Nose centered
normalFace[33] = { x: 0.35, y: 0.40, z: 0 } // Left eye outer
normalFace[263] = { x: 0.65, y: 0.40, z: 0 } // Right eye outer
normalFace[10] = { x: 0.50, y: 0.15, z: 0 } // Forehead
normalFace[152] = { x: 0.50, y: 0.85, z: 0 } // Chin

const resNormal = analyzeFaceLandmarksMock([normalFace])
assert.strictEqual(resNormal.faceCount, 1)
assert.strictEqual(resNormal.isFacePresent, true)
assert.strictEqual(resNormal.isLookingTowardsScreen, true)
assert.strictEqual(resNormal.isLookingAway, false)
console.log('✓ TEST 1B PASSED: Normal compliant single face confirmed.')

// 1C. Blinking ignored
const resBlink = analyzeFaceLandmarksMock([normalFace], {
  eyeBlinkLeft: 0.95,
  eyeBlinkRight: 0.95,
  eyeLookOutLeft: 0.70, // eyes flutter during blink
})
assert.strictEqual(resBlink.isBlinking, true)
assert.strictEqual(resBlink.isLookingAway, false, 'Blink must not be classified as looking away')
console.log('✓ TEST 1C PASSED: Normal blinking correctly ignored.')

// 1D. Head turned away (Yaw violation)
const faceTurnedAway: Point3D[] = normalFace.map((p) => ({ ...p }))
faceTurnedAway[1] = { x: 0.65, y: 0.50, z: 0 } // Nose pushed far right
const resYawAway = analyzeFaceLandmarksMock([faceTurnedAway])
assert.strictEqual(resYawAway.isLookingAway, true)
console.log('✓ TEST 1D PASSED: Head yaw rotation away correctly flagged.')

// 1E. Multiple faces detected
const secondFace: Point3D[] = normalFace.map((p) => ({ x: p.x + 0.3, y: p.y, z: p.z }))
const thirdFace: Point3D[] = normalFace.map((p) => ({ x: p.x - 0.3, y: p.y, z: p.z }))
const resMultiple = analyzeFaceLandmarksMock([normalFace, secondFace, thirdFace])
assert.strictEqual(resMultiple.faceCount, 3)
console.log('✓ TEST 1E PASSED: Multiple faces (3) detected accurately.\n')

// ── TEST 2: Warning State Machine & Escalation Logic ───────────────
class WarningStateMachine {
  lookingAwayWarnings = 0
  multipleFacesWarnings = 0
  noFaceWarnings = 0
  activeWarning: string | null = null
  terminated = false
  terminationReason: string | null = null

  isLookingAwayIncidentActive = false
  sustainedLookingAwayFrames = 0

  isMultipleFacesIncidentActive = false
  sustainedMultipleFacesFrames = 0

  isNoFaceIncidentActive = false
  sustainedNoFaceFrames = 0

  step(faceCount: number, isLookingAway: boolean) {
    if (this.terminated) return

    // 1. Multiple faces tracking
    if (faceCount > 1) {
      this.sustainedMultipleFacesFrames++
      if (this.sustainedMultipleFacesFrames >= 2 && !this.isMultipleFacesIncidentActive) {
        this.isMultipleFacesIncidentActive = true
        this.multipleFacesWarnings++
        if (this.multipleFacesWarnings === 1) {
          this.activeWarning = 'Multiple faces detected. Warning 1 of 3.'
        } else if (this.multipleFacesWarnings === 2) {
          this.activeWarning = 'Multiple faces detected again. Warning 2 of 3.'
        } else if (this.multipleFacesWarnings >= 3) {
          this.terminated = true
          this.terminationReason = 'Viewing session terminated: 3/3 Multiple Faces violations confirmed.'
        }
      }
    } else {
      this.sustainedMultipleFacesFrames = 0
      if (this.isMultipleFacesIncidentActive && faceCount === 1) {
        this.isMultipleFacesIncidentActive = false
        this.activeWarning = null
      }
    }

    // 2. No face detected tracking
    if (faceCount === 0) {
      this.sustainedNoFaceFrames++
      if (this.sustainedNoFaceFrames >= 2 && !this.isNoFaceIncidentActive) {
        this.isNoFaceIncidentActive = true
        this.noFaceWarnings++
        if (this.noFaceWarnings === 1) {
          this.activeWarning = 'No face detected. Warning 1 of 3.'
        } else if (this.noFaceWarnings === 2) {
          this.activeWarning = 'No face detected again. Warning 2 of 3.'
        } else if (this.noFaceWarnings >= 3) {
          this.terminated = true
          this.terminationReason = 'Viewing session terminated: 3/3 No Face Detected violations confirmed.'
        }
      }
    } else {
      this.sustainedNoFaceFrames = 0
      if (this.isNoFaceIncidentActive) {
        this.isNoFaceIncidentActive = false
        this.activeWarning = null
      }
    }

    // 3. Looking away tracking
    if (faceCount === 1) {
      if (isLookingAway) {
        this.sustainedLookingAwayFrames++
        if (this.sustainedLookingAwayFrames >= 2 && !this.isLookingAwayIncidentActive) {
          this.isLookingAwayIncidentActive = true
          this.lookingAwayWarnings++
          if (this.lookingAwayWarnings === 1) {
            this.activeWarning = 'Looking away detected. Warning 1 of 3.'
          } else if (this.lookingAwayWarnings === 2) {
            this.activeWarning = 'Looking away detected again. Warning 2 of 3.'
          } else if (this.lookingAwayWarnings >= 3) {
            this.terminated = true
            this.terminationReason = 'Viewing session terminated: 3/3 Looking Away violations confirmed.'
          }
        }
      } else {
        this.sustainedLookingAwayFrames = 0
        if (this.isLookingAwayIncidentActive) {
          this.isLookingAwayIncidentActive = false
          this.activeWarning = null
        }
      }
    }
  }
}

// 2A. Test Looking Away Escalation & Repetition
const smGaze = new WarningStateMachine()
// 1 frame looking away (< 2) -> No warning yet (blink ignored)
smGaze.step(1, true)
assert.strictEqual(smGaze.lookingAwayWarnings, 0, 'Single frame must not trigger warning')

// 2nd frame looking away -> Warning 1
smGaze.step(1, true)
assert.strictEqual(smGaze.lookingAwayWarnings, 1)
assert.ok(smGaze.activeWarning?.includes('Warning 1'))
console.log('✓ TEST 2A PASSED: First look-away episode triggers Warning 1.')

// Continuous looking away -> Must NOT increment repeatedly during the same uninterrupted look-away
for (let i = 0; i < 10; i++) smGaze.step(1, true)
assert.strictEqual(smGaze.lookingAwayWarnings, 1, 'Same continuous episode must not increment twice')
console.log('✓ TEST 2B PASSED: Continuous episode counts as single violation.')

// User looks back at screen -> Immediate unlatch!
smGaze.step(1, false)
assert.strictEqual(smGaze.isLookingAwayIncidentActive, false)
console.log('✓ TEST 2C PASSED: Looking back unlatches state machine.')

// Second separate look-away episode -> Warning 2!
smGaze.step(1, true)
smGaze.step(1, true)
assert.strictEqual(smGaze.lookingAwayWarnings, 2)
console.log('✓ TEST 2D PASSED: Second look-away episode successfully increments Warning 2.')

// User looks back at screen again
smGaze.step(1, false)

// Third separate look-away episode -> Warning 3 & Immediate Termination!
smGaze.step(1, true)
smGaze.step(1, true)
assert.strictEqual(smGaze.lookingAwayWarnings, 3)
assert.strictEqual(smGaze.terminated, true)
console.log('✓ TEST 2E PASSED: Third look-away episode terminates viewing session.\n')

// 2B. Test No Face Detected Escalation
const smNoFace = new WarningStateMachine()
// Episode 1
smNoFace.step(0, false)
smNoFace.step(0, false)
assert.strictEqual(smNoFace.noFaceWarnings, 1)

// Return face
smNoFace.step(1, false)

// Episode 2
smNoFace.step(0, false)
smNoFace.step(0, false)
assert.strictEqual(smNoFace.noFaceWarnings, 2)

// Return face
smNoFace.step(1, false)

// Episode 3 -> Termination!
smNoFace.step(0, false)
smNoFace.step(0, false)
assert.strictEqual(smNoFace.noFaceWarnings, 3)
assert.strictEqual(smNoFace.terminated, true)
console.log('✓ TEST 2F PASSED: No Face Detected episodes increment 1 -> 2 -> 3 and terminate.\n')

// 2C. Test Multiple Faces Escalation
const smPeople = new WarningStateMachine()
smPeople.step(2, false)
smPeople.step(2, false)
assert.strictEqual(smPeople.multipleFacesWarnings, 1)

smPeople.step(1, false)

smPeople.step(2, false)
smPeople.step(2, false)
assert.strictEqual(smPeople.multipleFacesWarnings, 2)

smPeople.step(1, false)

smPeople.step(2, false)
smPeople.step(2, false)
assert.strictEqual(smPeople.multipleFacesWarnings, 3)
assert.strictEqual(smPeople.terminated, true)
console.log('✓ TEST 2G PASSED: Multiple Faces episodes increment 1 -> 2 -> 3 and terminate.\n')

// 2D. Independent Counters Verification Across All 3 Categories
const smTri = new WarningStateMachine()
smTri.step(1, true)
smTri.step(1, true)
smTri.step(1, false)

smTri.step(2, false)
smTri.step(2, false)
smTri.step(1, false)

smTri.step(0, false)
smTri.step(0, false)
smTri.step(1, false)

assert.strictEqual(smTri.lookingAwayWarnings, 1)
assert.strictEqual(smTri.multipleFacesWarnings, 1)
assert.strictEqual(smTri.noFaceWarnings, 1)
assert.strictEqual(smTri.terminated, false, 'Categories must remain independent and not cause premature termination')
console.log('✓ TEST 2H PASSED: All three counters operate completely independently.\n')

console.log('All MediaPipe Face & Eye Monitoring unit tests passed successfully!')

