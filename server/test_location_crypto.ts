import assert from 'node:assert'
import {
  encryptLocationConfig,
  decryptLocationConfig,
  calculateHaversineDistanceKm,
  generateLocationAuthToken,
  verifyLocationAuthToken,
} from './src/services/locationCrypto'

console.log('Testing locationCrypto.ts...')

// 1. Encryption and Decryption test
const original = {
  latitude: -33.8568,
  longitude: 151.2153,
  radiusKm: 5,
  locationName: 'Sydney Opera House',
}

const encrypted = encryptLocationConfig(original)
assert.strictEqual(encrypted.version, 1)
assert.strictEqual(encrypted.iv.length, 24, 'IV should be 12 bytes (24 hex characters)')
assert.strictEqual(encrypted.authTag.length, 32, 'Auth tag should be 16 bytes (32 hex characters)')
assert.ok(encrypted.ciphertext.length > 0)
// Ensure plaintext coordinates are NOT visible in ciphertext or iv
assert.ok(!encrypted.ciphertext.includes('-33.8568'))
assert.ok(!encrypted.ciphertext.includes('151.2153'))
assert.ok(!encrypted.ciphertext.includes('Sydney Opera House'))

const decrypted = decryptLocationConfig(encrypted)
assert.strictEqual(decrypted.latitude, original.latitude)
assert.strictEqual(decrypted.longitude, original.longitude)
assert.strictEqual(decrypted.radiusKm, original.radiusKm)
assert.strictEqual(decrypted.locationName, original.locationName)
console.log('✓ Location encryption and authenticated decryption passed.')

// 2. Fresh IV uniqueness
const enc2 = encryptLocationConfig(original)
assert.notStrictEqual(encrypted.iv, enc2.iv, 'Each encryption must use a unique IV')
assert.notStrictEqual(encrypted.ciphertext, enc2.ciphertext)
console.log('✓ IV uniqueness verified.')

// 3. Tamper detection
const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -2) + 'aa' }
assert.throws(() => {
  decryptLocationConfig(tampered)
}, /Unsupported state or unable to authenticate data|bad decrypt/i)
console.log('✓ Authenticated tamper rejection verified.')

// 4. Haversine distance tests
// Same point = 0 km
const d0 = calculateHaversineDistanceKm(40.7128, -74.006, 40.7128, -74.006)
assert.ok(d0 < 0.001)

// Distance between Sydney Opera House (-33.8568, 151.2153) and Sydney Harbour Bridge (-33.8523, 151.2108) ~ 0.65 km
const dBridge = calculateHaversineDistanceKm(-33.8568, 151.2153, -33.8523, 151.2108)
assert.ok(dBridge > 0.5 && dBridge < 1.0, `Expected ~0.65 km, got ${dBridge}`)

// Distance between London (51.5074, -0.1278) and Paris (48.8566, 2.3522) ~ 343 km
const dParis = calculateHaversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522)
assert.ok(dParis > 340 && dParis < 350, `Expected ~343 km, got ${dParis}`)
console.log('✓ Haversine distance calculations verified.')

// 5. Signed authorization token tests
const transferId = 'test-transfer-abc-123'
const token = generateLocationAuthToken(transferId)
assert.ok(verifyLocationAuthToken(transferId, token))

// Wrong transferId rejected
assert.strictEqual(verifyLocationAuthToken('wrong-transfer-id', token), false)

// Tampered token rejected
const tamperedToken = token.slice(0, -4) + 'zzzz'
assert.strictEqual(verifyLocationAuthToken(transferId, tamperedToken), false)

console.log('✓ Short-lived signed authorization token verified.')
console.log('All locationCrypto unit tests passed successfully!')

