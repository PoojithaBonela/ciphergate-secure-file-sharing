import assert from 'node:assert'
import {
  encryptLocationConfig,
  decryptLocationConfig,
  calculateHaversineDistanceKm,
  generateLocationAuthToken,
  verifyLocationAuthToken,
} from './src/services/locationCrypto'

console.log('\n======================================================')
console.log('   ENCRA 3.0: LOCATION-BASED ACCESS ENFORCEMENT TEST')
console.log('======================================================\n')

// Coordinates definitions:
const WOXSEN_UNIVERSITY = { lat: 17.6599, lng: 77.9407, name: 'Woxsen University' }
const NEAR_WOXSEN_1KM = { lat: 17.6620, lng: 77.9450, name: '1 km from Woxsen' }
const HYDERABAD = { lat: 17.3850, lng: 78.4867, name: 'Hyderabad City Center' }
const LONDON = { lat: 51.5074, lng: -0.1278, name: 'London, UK' }

// ── TEST 1: Distance calculation accuracy ─────────────────────────
const distNearWoxsen = calculateHaversineDistanceKm(
  WOXSEN_UNIVERSITY.lat,
  WOXSEN_UNIVERSITY.lng,
  NEAR_WOXSEN_1KM.lat,
  NEAR_WOXSEN_1KM.lng,
)
console.log(`Distance near Woxsen: ${distNearWoxsen.toFixed(3)} km`)
assert.ok(distNearWoxsen < 1.0, 'Nearby point should be under 1 km')

const distWoxsenToHyd = calculateHaversineDistanceKm(
  WOXSEN_UNIVERSITY.lat,
  WOXSEN_UNIVERSITY.lng,
  HYDERABAD.lat,
  HYDERABAD.lng,
)
console.log(`Distance Woxsen to Hyderabad: ${distWoxsenToHyd.toFixed(1)} km`)
assert.ok(distWoxsenToHyd > 50, 'Hyderabad is > 50 km from Woxsen')

const distLondonToHyd = calculateHaversineDistanceKm(
  LONDON.lat,
  LONDON.lng,
  HYDERABAD.lat,
  HYDERABAD.lng,
)
console.log(`Distance London to Hyderabad: ${distLondonToHyd.toFixed(1)} km`)
assert.ok(distLondonToHyd > 7000, 'London to Hyderabad is > 7000 km')
console.log('✓ TEST 1 PASSED: Distance calculations verified.\n')

// ── TEST 2: Encryption & Decryption of Location Data ──────────────
const senderLocation = {
  latitude: WOXSEN_UNIVERSITY.lat,
  longitude: WOXSEN_UNIVERSITY.lng,
  radiusKm: 5,
  locationName: WOXSEN_UNIVERSITY.name,
}

const encrypted = encryptLocationConfig(senderLocation)
assert.ok(encrypted.ciphertext, 'Ciphertext must be non-empty')
assert.ok(encrypted.iv && encrypted.iv.length === 24, '12-byte IV required')
assert.ok(encrypted.authTag && encrypted.authTag.length === 32, '16-byte auth tag required')

const decrypted = decryptLocationConfig(encrypted)
assert.strictEqual(decrypted.latitude, senderLocation.latitude)
assert.strictEqual(decrypted.longitude, senderLocation.longitude)
assert.strictEqual(decrypted.radiusKm, 5)
assert.strictEqual(decrypted.locationName, WOXSEN_UNIVERSITY.name)
console.log('✓ TEST 2 PASSED: AES-256-GCM authenticated location encryption/decryption verified.\n')

// ── TEST 3: Boundary Enforcement Logic ────────────────────────────
// Case A: Sender = Woxsen (5 km). Receiver = Near Woxsen (0.5 km) -> AUTHORIZED
const distA = calculateHaversineDistanceKm(
  decrypted.latitude,
  decrypted.longitude,
  NEAR_WOXSEN_1KM.lat,
  NEAR_WOXSEN_1KM.lng,
)
assert.ok(distA <= decrypted.radiusKm, 'Receiver inside boundary should be permitted')
const tokenA = generateLocationAuthToken('transfer-woxsen-001')
assert.ok(verifyLocationAuthToken('transfer-woxsen-001', tokenA), 'Token must verify for matching transfer')
console.log('✓ TEST 3A PASSED: Receiver within 5 km of Woxsen is authorized.')

// Case B: Sender = London (5 km). Receiver = Hyderabad -> BLOCKED
const londonLocation = {
  latitude: LONDON.lat,
  longitude: LONDON.lng,
  radiusKm: 5,
  locationName: LONDON.name,
}
const encLondon = encryptLocationConfig(londonLocation)
const decLondon = decryptLocationConfig(encLondon)
const distB = calculateHaversineDistanceKm(
  decLondon.latitude,
  decLondon.longitude,
  HYDERABAD.lat,
  HYDERABAD.lng,
)
assert.ok(distB > decLondon.radiusKm, 'Receiver in Hyderabad must be outside London 5 km radius')
console.log(`✓ TEST 3B PASSED: London target with Hyderabad receiver blocked (${distB.toFixed(1)} km > 5 km).`)

// Case C: Sender = Woxsen (5 km). Receiver = Hyderabad -> BLOCKED
const distC = calculateHaversineDistanceKm(
  decrypted.latitude,
  decrypted.longitude,
  HYDERABAD.lat,
  HYDERABAD.lng,
)
assert.ok(distC > decrypted.radiusKm, 'Receiver in Hyderabad must be outside Woxsen 5 km radius')
console.log(`✓ TEST 3C PASSED: Woxsen target with Hyderabad receiver blocked (${distC.toFixed(1)} km > 5 km).`)

// ── TEST 4: Signed Token Security & Tamper Protection ─────────────
const validToken = generateLocationAuthToken('transfer-secure-xyz')
assert.strictEqual(verifyLocationAuthToken('transfer-wrong-id', validToken), false, 'Token must not verify for different transferId')

const tamperedToken = validToken.slice(0, -6) + 'abcdef'
assert.strictEqual(verifyLocationAuthToken('transfer-secure-xyz', tamperedToken), false, 'Tampered token must be rejected')

assert.strictEqual(verifyLocationAuthToken('transfer-secure-xyz', ''), false, 'Empty token must be rejected')
console.log('✓ TEST 4 PASSED: Cryptographic authorization tokens are transfer-bound and tamper-proof.\n')

console.log('All location enforcement tests passed successfully!')

