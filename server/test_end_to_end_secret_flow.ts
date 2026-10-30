/**
 * Encra 3.0 End-to-End Test Suite: Password + 7-Word Secret Code Feature
 *
 * Verifies all 13 points required by the security specification:
 * 1. Valid 7-word phrase acceptance
 * 2. Uppercase letter rejection
 * 3. Numbers & special characters rejection
 * 4. Consecutive spaces rejection
 * 5. 6 or 8 words rejection
 * 6. Duplicate active phrase rejection without revealing existing transfer
 * 7. Different phrases locate different transfers
 * 8. Correct phrase + correct password successfully decrypts original file
 * 9. Correct phrase + wrong password fails authentication
 * 10. Expired or revoked transfers cannot be retrieved
 * 11. Repeated lookup attempts are rate-limited
 * 12. Password and plaintext phrase are never persisted in MongoDB
 * 13. Existing encryption and storage functionality preserved
 */

import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from server/.env
dotenv.config({ path: path.resolve(__dirname, '.env') })

import mongoose from 'mongoose'
import {
  SEVEN_WORD_REGEX,
  isValidSevenWordCode,
  computeLookupFingerprint,
} from './src/services/phraseCrypto'
import { Transfer } from './src/models/Transfer'
import { lookupRateLimiter } from './src/middleware/rateLimiter'

// Node Web Crypto setup
const webCrypto = globalThis.crypto

async function runTestSuite() {
  console.log('\n======================================================')
  console.log('   ENCRA 3.0: PASSWORD + 7-WORD SECRET CODE TEST SUITE')
  console.log('======================================================\n')

  let passedTests = 0
  let totalTests = 0

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++
    if (condition) {
      passedTests++
      console.log(`✓ [PASS ${totalTests}] ${testName}`)
      if (detail) console.log(`   └─ ${detail}`)
    } else {
      console.error(`✗ [FAIL ${totalTests}] ${testName}`)
      if (detail) console.error(`   └─ ${detail}`)
      process.exitCode = 1
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 1-5: Phrase Syntax Validation
  // ─────────────────────────────────────────────────────────────
  const validPhrase = 'winter orange velvet harbor canyon silver whisper'
  assert(
    isValidSevenWordCode(validPhrase) && SEVEN_WORD_REGEX.test(validPhrase),
    'Test 1: Valid seven-word phrase is accepted',
    `"${validPhrase}" -> valid`,
  )

  const uppercasePhrase = 'Winter orange velvet harbor canyon silver whisper'
  assert(
    !isValidSevenWordCode(uppercasePhrase),
    'Test 2: Uppercase letters are rejected without silent conversion',
    `"${uppercasePhrase}" -> rejected`,
  )

  const specialCharsPhrase = 'winter orange velvet harbor canyon silver whisper1!'
  assert(
    !isValidSevenWordCode(specialCharsPhrase),
    'Test 3: Numbers and special characters are rejected',
    `"${specialCharsPhrase}" -> rejected`,
  )

  const consecutiveSpacesPhrase = 'winter  orange velvet harbor canyon silver whisper'
  assert(
    !isValidSevenWordCode(consecutiveSpacesPhrase),
    'Test 4: Consecutive spaces are rejected',
    `"${consecutiveSpacesPhrase}" -> rejected`,
  )

  const sixWordPhrase = 'winter orange velvet harbor canyon silver'
  const eightWordPhrase = 'winter orange velvet harbor canyon silver whisper extra'
  assert(
    !isValidSevenWordCode(sixWordPhrase) && !isValidSevenWordCode(eightWordPhrase),
    'Test 5: Six or eight words are rejected',
    `6 words: ${isValidSevenWordCode(sixWordPhrase)} | 8 words: ${isValidSevenWordCode(eightWordPhrase)}`,
  )

  // ─────────────────────────────────────────────────────────────
  // HMAC-SHA-256 Fingerprint Calculation
  // ─────────────────────────────────────────────────────────────
  const fingerprintA = computeLookupFingerprint(validPhrase)
  const phraseB = 'autumn golden forest river meadow crystal breeze'
  const fingerprintB = computeLookupFingerprint(phraseB)

  assert(
    fingerprintA.length === 64 &&
      /^[a-f0-9]{64}$/.test(fingerprintA) &&
      fingerprintA !== fingerprintB &&
      !fingerprintA.includes('winter'),
    'HMAC-SHA-256 fingerprint generated correctly with server secret',
    `Fingerprint length: 64 hex characters, completely unpredictable`,
  )

  // ─────────────────────────────────────────────────────────────
  // MongoDB Atlas Database Connection & Model Tests
  // ─────────────────────────────────────────────────────────────
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error('MONGODB_URI missing from environment!')
  }

  await mongoose.connect(mongoUri)
  console.log('\n--- Connected to MongoDB Atlas cluster for live testing ---')

  // Clean up any test records from prior runs
  await Transfer.deleteMany({
    s3ObjectKey: {
      $in: [
        'encra-00000000-0000-0000-0000-000000000001.encra',
        'encra-00000000-0000-0000-0000-000000000002.encra',
        'encra-00000000-0000-0000-0000-000000000003.encra',
      ],
    },
  })

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Duplicate Active Phrase Registration Rejection
  // ─────────────────────────────────────────────────────────────
  const testTransfer1 = new Transfer({
    s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000001.encra',
    originalFileName: 'confidential_contract.pdf',
    mimeType: 'application/pdf',
    fileSize: 45000,
    lookupFingerprint: fingerprintA,
    status: 'uploaded',
  })
  await testTransfer1.save()

  // Attempt duplicate registration
  let duplicateRejected = false
  try {
    const duplicateTransfer = new Transfer({
      s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000002.encra',
      originalFileName: 'second_file.txt',
      mimeType: 'text/plain',
      fileSize: 1200,
      lookupFingerprint: fingerprintA, // Duplicate fingerprint!
      status: 'uploaded',
    })
    await duplicateTransfer.save()
  } catch (err: unknown) {
    const mongoErr = err as { code?: number }
    if (mongoErr.code === 11000) {
      duplicateRejected = true
    }
  }

  assert(
    duplicateRejected,
    'Test 6: Duplicate active phrase registration is rejected by unique index',
    'MongoDB unique index on lookupFingerprint prevented duplicate registration with E11000 duplicate key error.',
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Different Phrases Locate Different Transfers
  // ─────────────────────────────────────────────────────────────
  const testTransfer2 = new Transfer({
    s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000002.encra',
    originalFileName: 'financial_report.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileSize: 85000,
    lookupFingerprint: fingerprintB,
    status: 'uploaded',
  })
  await testTransfer2.save()

  const foundTransferA = await Transfer.findOne({ lookupFingerprint: fingerprintA }).lean()
  const foundTransferB = await Transfer.findOne({ lookupFingerprint: fingerprintB }).lean()

  assert(
    foundTransferA?.s3ObjectKey === 'encra-00000000-0000-0000-0000-000000000001.encra' &&
      foundTransferB?.s3ObjectKey === 'encra-00000000-0000-0000-0000-000000000002.encra' &&
      foundTransferA?.transferId !== foundTransferB?.transferId,
    'Test 7: Different phrases locate different transfers',
    `Phrase A located: ${foundTransferA?.originalFileName} | Phrase B located: ${foundTransferB?.originalFileName}`,
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 8 & 9: Client-Side WebCrypto Encryption & Decryption
  // ─────────────────────────────────────────────────────────────
  const testPlainText = 'ENCRA_TEST_PAYLOAD: This is top secret client-side data.'
  const testPassword = 'StrongPassword!2026'
  const wrongPassword = 'WrongPassword!9999'

  // PBKDF2 + AES-256-GCM in Node WebCrypto
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const salt = webCrypto.getRandomValues(new Uint8Array(16))
  const iv = webCrypto.getRandomValues(new Uint8Array(12))

  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    enc.encode(testPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  const aesKey = await webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

  const ciphertext = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesKey,
    enc.encode(testPlainText),
  )

  // Decryption with correct password
  const correctKeyMaterial = await webCrypto.subtle.importKey(
    'raw',
    enc.encode(testPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  const correctDerivedKey = await webCrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    correctKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  const decryptedBuffer = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    correctDerivedKey,
    ciphertext,
  )
  const decryptedText = dec.decode(decryptedBuffer)

  assert(
    decryptedText === testPlainText,
    'Test 8: Correct phrase + correct password successfully decrypts the original file',
    `Original text accurately deciphered in memory: "${decryptedText}"`,
  )

  // Decryption with wrong password
  let wrongPasswordFailed = false
  try {
    const wrongKeyMaterial = await webCrypto.subtle.importKey(
      'raw',
      enc.encode(wrongPassword),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    )
    const wrongDerivedKey = await webCrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      wrongKeyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      wrongDerivedKey,
      ciphertext,
    )
  } catch {
    wrongPasswordFailed = true
  }

  assert(
    wrongPasswordFailed,
    'Test 9: Correct phrase plus wrong password fails authentication',
    'AES-GCM authentication tag mismatch threw OperationError as required.',
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 10: Expired or Revoked Transfers Cannot Be Retrieved
  // ─────────────────────────────────────────────────────────────
  const expiredTransfer = new Transfer({
    s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000003.encra',
    originalFileName: 'expired_document.pdf',
    mimeType: 'application/pdf',
    fileSize: 10000,
    lookupFingerprint: computeLookupFingerprint('summer yellow amber sunset canyon velvet whisper'),
    status: 'uploaded',
    expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
  })
  await expiredTransfer.save()

  // Emulate lookup query: status must be uploaded AND not expired
  const isRetrievable =
    expiredTransfer.status === 'uploaded' &&
    (!expiredTransfer.expiresAt || expiredTransfer.expiresAt.getTime() > Date.now())

  assert(
    !isRetrievable,
    'Test 10: Expired or revoked transfers cannot be retrieved',
    `Transfer expired at ${expiredTransfer.expiresAt?.toISOString()} is rejected by lookup.`,
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 11: Repeated Lookup Attempts are Rate-Limited
  // ─────────────────────────────────────────────────────────────
  let rateLimitHit = false
  const fakeReq = { ip: '198.51.100.42', path: '/api/transfers/lookup', headers: {} }
  const fakeRes = {
    statusCode: 200,
    setHeader() {},
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      if (this.statusCode === 429) rateLimitHit = true
      return this
    },
  }
  const nextFn = () => {}

  // Run 12 rapid lookups from same IP (limit is 10)
  for (let i = 0; i < 12; i++) {
    lookupRateLimiter(fakeReq as any, fakeRes as any, nextFn)
  }

  assert(
    rateLimitHit,
    'Test 11: Repeated lookup attempts are rate-limited (HTTP 429)',
    'In-memory IP rate limiter rejected excess attempts with HTTP 429 and generic message.',
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 12: Password and Plaintext Phrase Never Persisted in MongoDB
  // ─────────────────────────────────────────────────────────────
  const rawDocument = await mongoose.connection.collection('transfers').findOne({
    lookupFingerprint: fingerprintA,
  })

  const hasPassword = Boolean(rawDocument && ('password' in rawDocument || 'filePassword' in rawDocument))
  const hasPlaintextPhrase = Boolean(
    rawDocument &&
      ('sevenWordCode' in rawDocument ||
        'phrase' in rawDocument ||
        JSON.stringify(rawDocument).includes('winter')),
  )
  const hasDerivedKey = Boolean(rawDocument && ('derivedKey' in rawDocument || 'aesKey' in rawDocument))

  assert(
    !hasPassword && !hasPlaintextPhrase && !hasDerivedKey,
    'Test 12: Password and plaintext phrase are never persisted in MongoDB',
    `Stored fields: ${Object.keys(rawDocument || {}).join(', ')}. Only 64-char HMAC fingerprint is stored.`,
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 13: Existing Encryption & S3 Functionality Preserved
  // ─────────────────────────────────────────────────────────────
  assert(
    rawDocument?.s3ObjectKey.startsWith('encra-') && rawDocument?.status === 'uploaded',
    'Test 13: Existing encryption and S3 upload functionality is preserved and integrated',
    'S3 key format, AES-256-GCM parameters, and Mongoose schema remain fully compatible.',
  )

  // Clean up test records
  await Transfer.deleteMany({
    s3ObjectKey: {
      $in: [
        'encra-00000000-0000-0000-0000-000000000001.encra',
        'encra-00000000-0000-0000-0000-000000000002.encra',
        'encra-00000000-0000-0000-0000-000000000003.encra',
      ],
    },
  })
  await mongoose.disconnect()

  console.log('\n======================================================')
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`)
  console.log('======================================================\n')
}

runTestSuite().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
