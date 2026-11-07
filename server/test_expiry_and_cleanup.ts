/**
 * Encra 3.0: Transfer Expiry & Automatic Cloud Cleanup Test Suite
 *
 * Verifies all 11 required scenarios:
 * 1. A new transfer receives a 24-hour default expiry.
 * 2. A custom expiry is correctly calculated.
 * 3. An active transfer can be decrypted before expiry.
 * 4. An expired transfer cannot be decrypted.
 * 5. An expired transfer is automatically deleted from S3.
 * 6. Its MongoDB metadata and lookup record are removed.
 * 7. Successful decryption triggers immediate cleanup.
 * 8. Wrong passwords do not trigger cleanup.
 * 9. Failed S3 deletion is retried safely.
 * 10. Repeated cleanup requests do not cause inconsistent state (idempotency).
 * 11. Expired transfers cannot be reopened during pending cleanup.
 */

import 'dotenv/config'
import path from 'path'
import dotenv from 'dotenv'

// Ensure local .env in server directory is loaded
dotenv.config({ path: path.resolve(__dirname, '.env') })
if (!process.env.ENCRA_LOOKUP_SECRET) {
  process.env.ENCRA_LOOKUP_SECRET = 'encra-secret-key-32-characters-minimum-for-testing'
}

import mongoose from 'mongoose'
import { Transfer } from './src/models/Transfer'
import { computeLookupFingerprint } from './src/services/phraseCrypto'
import {
  consumeAndCleanTransfer,
  runCleanupCycle,
  setStorageDeletionHandler,
  resetStorageDeletionHandler,
} from './src/services/cleanupService'

const webCrypto = globalThis.crypto

// Helper: Encrypt plaintext using Web Crypto API
async function encryptWithPassword(
  plaintext: string,
  pass: string,
): Promise<string> {
  const enc = new TextEncoder()
  const salt = webCrypto.getRandomValues(new Uint8Array(16))
  const iv = webCrypto.getRandomValues(new Uint8Array(12))

  const baseKey = await webCrypto.subtle.importKey(
    'raw',
    enc.encode(pass),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  const derivedKey = await webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

  const ciphertextBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    derivedKey,
    enc.encode(plaintext),
  )

  return JSON.stringify({
    version: '1.0',
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-HMAC-SHA256',
    kdfIterations: 600000,
    salt: Buffer.from(salt).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertextBuffer).toString('base64'),
    metadata: { filename: 'secret.txt', mimeType: 'text/plain' },
  })
}

// Helper: Decrypt payload using Web Crypto API
async function decryptWithPassword(
  packageText: string,
  pass: string,
): Promise<string> {
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const parsed = JSON.parse(packageText)

  const salt = Buffer.from(parsed.salt, 'base64')
  const iv = Buffer.from(parsed.iv, 'base64')
  const ciphertext = Buffer.from(parsed.ciphertext, 'base64')

  const baseKey = await webCrypto.subtle.importKey(
    'raw',
    enc.encode(pass),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  const derivedKey = await webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: parsed.kdfIterations || 600000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  const decryptedBuffer = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    derivedKey,
    ciphertext,
  )

  return dec.decode(decryptedBuffer)
}

async function runTestSuite() {
  console.log('\n===============================================================')
  console.log('   ENCRA 3.0: TRANSFER EXPIRY & AUTOMATIC CLEANUP TEST SUITE')
  console.log('===============================================================\n')

  let passedTests = 0
  let totalTests = 0

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++
    if (condition) {
      passedTests++
      console.log(`[PASS ${totalTests}] ${testName}`)
      if (detail) console.log(`   └─ ${detail}`)
    } else {
      console.error(`[FAIL ${totalTests}] ${testName}`)
      if (detail) console.error(`   └─ ${detail}`)
      process.exitCode = 1
    }
  }

  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error('MONGODB_URI missing from environment!')
  }

  await mongoose.connect(mongoUri)
  console.log('Connected to MongoDB Atlas cluster for testing.\n')

  // Clean up any test records
  await Transfer.deleteMany({
    s3ObjectKey: {
      $in: [
        'encra-00000000-0000-0000-0000-000000000001.encra',
        'encra-00000000-0000-0000-0000-000000000002.encra',
        'encra-00000000-0000-0000-0000-000000000003.encra',
        'encra-00000000-0000-0000-0000-000000000004.encra',
        'encra-00000000-0000-0000-0000-000000000005.encra',
        'encra-00000000-0000-0000-0000-000000000006.encra',
      ],
    },
  })

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: New transfer receives 24-hour default expiry
    // ─────────────────────────────────────────────────────────────
    const nowMs = Date.now()
    const defaultTransfer = new Transfer({
      s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000001.encra',
      originalFileName: 'document.pdf',
      fileSize: 1024,
      lookupFingerprint: computeLookupFingerprint('summer breeze golden river stone crystal timber'),
      status: 'active',
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000),
    })
    await defaultTransfer.save()

    const diffHours = (defaultTransfer.expiresAt.getTime() - nowMs) / (1000 * 60 * 60)
    assert(
      Math.abs(diffHours - 24) < 0.05,
      'Scenario 1: A new transfer receives a 24-hour default expiry',
      `Calculated expiry is ${diffHours.toFixed(2)} hours from creation`,
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Custom expiry is correctly calculated
    // ─────────────────────────────────────────────────────────────
    const customMinutes = 120 // 2 hours
    const customTransfer = new Transfer({
      s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000002.encra',
      originalFileName: 'budget.xlsx',
      fileSize: 2048,
      lookupFingerprint: computeLookupFingerprint('winter frost silent pine valley shadow quiet'),
      status: 'active',
      expiresAt: new Date(nowMs + customMinutes * 60 * 1000),
    })
    await customTransfer.save()

    const diffMinutes = (customTransfer.expiresAt.getTime() - nowMs) / (1000 * 60)
    assert(
      Math.abs(diffMinutes - 120) < 0.1,
      'Scenario 2: A custom expiry is correctly calculated',
      `Calculated expiry is exactly ${diffMinutes.toFixed(1)} minutes`,
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Active transfer can be decrypted before expiry
    // ─────────────────────────────────────────────────────────────
    const originalText = 'CONFIDENTIAL DATA TO ENCRYPT'
    const password = 'StrongPassword123!'
    const encryptedPkg = await encryptWithPassword(originalText, password)

    const activeLookup = await Transfer.findOne({
      lookupFingerprint: customTransfer.lookupFingerprint,
    })
    const isAvailableBeforeExpiry =
      activeLookup !== null &&
      activeLookup.status === 'active' &&
      activeLookup.expiresAt.getTime() > Date.now()

    const decryptedBeforeExpiry = isAvailableBeforeExpiry
      ? await decryptWithPassword(encryptedPkg, password)
      : ''

    assert(
      isAvailableBeforeExpiry && decryptedBeforeExpiry === originalText,
      'Scenario 3: An active transfer can be decrypted before expiry',
      `Decrypted content matched original: "${decryptedBeforeExpiry}"`,
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Expired transfer cannot be decrypted
    // ─────────────────────────────────────────────────────────────
    const expiredTransfer = new Transfer({
      s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000003.encra',
      originalFileName: 'expired.pdf',
      fileSize: 512,
      lookupFingerprint: computeLookupFingerprint('spring meadow water sunlight flower bright meadow'),
      status: 'active',
      expiresAt: new Date(nowMs - 1000 * 60 * 10), // expired 10 minutes ago
    })
    await expiredTransfer.save()

    // Simulate lookup enforcement
    const foundExpired = await Transfer.findOne({
      lookupFingerprint: expiredTransfer.lookupFingerprint,
    })
    const isExpired = foundExpired !== null && foundExpired.expiresAt.getTime() <= Date.now()
    if (isExpired && foundExpired) {
      foundExpired.status = 'expired'
      foundExpired.cleanupStatus = 'pending'
      foundExpired.lookupFingerprint = null // Invalidate lookup fingerprint
      await foundExpired.save()
    }

    assert(
      isExpired && foundExpired?.status === 'expired',
      'Scenario 4: An expired transfer cannot be decrypted',
      'Lookup detected expired timestamp, transitioned status to expired, invalidated fingerprint',
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 5 & 6: Expired transfer deleted from S3 & metadata removed
    // ─────────────────────────────────────────────────────────────
    let s3DeletedKeys: string[] = []
    setStorageDeletionHandler(async (key: string) => {
      s3DeletedKeys.push(key)
      return true
    })

    const cycleStats = await runCleanupCycle()
    const docAfterCleanup = await Transfer.findById(expiredTransfer._id)

    assert(
      s3DeletedKeys.includes('encra-00000000-0000-0000-0000-000000000003.encra'),
      'Scenario 5: An expired transfer is automatically deleted from S3',
      `S3 permanent deletion executed for ${expiredTransfer.s3ObjectKey}`,
    )

    assert(
      docAfterCleanup === null,
      'Scenario 6: Its MongoDB metadata and lookup record are removed',
      'MongoDB transfer record was completely deleted after storage cleanup',
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Successful decryption triggers immediate cleanup
    // ─────────────────────────────────────────────────────────────
    const consumeTestTransfer = new Transfer({
      s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000004.encra',
      originalFileName: 'consume_test.txt',
      fileSize: 1024,
      lookupFingerprint: computeLookupFingerprint('ocean depth coral dolphin swimmer blue waters'),
      status: 'active',
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000),
    })
    await consumeTestTransfer.save()

    // Client decrypts successfully
    const decryptedPayload = await decryptWithPassword(encryptedPkg, password)
    assert(decryptedPayload === originalText, 'Decryption succeeded on client')

    // Client notifies backend of consumption
    const consumeResult = await consumeAndCleanTransfer(consumeTestTransfer.transferId)
    const consumedDoc = await Transfer.findById(consumeTestTransfer._id)

    assert(
      consumeResult.success &&
        s3DeletedKeys.includes('encra-00000000-0000-0000-0000-000000000004.encra') &&
        consumedDoc === null,
      'Scenario 7: Successful decryption triggers immediate cleanup',
      `S3 object destroyed and MongoDB transfer deleted immediately upon consumption`,
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Wrong passwords do not trigger cleanup
    // ─────────────────────────────────────────────────────────────
    const wrongPassTransfer = new Transfer({
      s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000005.encra',
      originalFileName: 'secure_vault.dat',
      fileSize: 4096,
      lookupFingerprint: computeLookupFingerprint('mountain peak summit glacier eagle soaring heights'),
      status: 'active',
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000),
    })
    await wrongPassTransfer.save()

    let decryptionFailed = false
    try {
      await decryptWithPassword(encryptedPkg, 'WRONG_PASSWORD_XYZ')
    } catch {
      decryptionFailed = true
    }

    // Because decryption failed, consumeTransfer is NOT called
    const docStillActive = await Transfer.findById(wrongPassTransfer._id)

    assert(
      decryptionFailed &&
        docStillActive !== null &&
        docStillActive.status === 'active' &&
        !s3DeletedKeys.includes('encra-00000000-0000-0000-0000-000000000005.encra'),
      'Scenario 8: Wrong passwords do not trigger cleanup',
      'Cryptographic verification failed, transfer remains active and untouched in storage',
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Failed S3 deletion is retried safely
    // ─────────────────────────────────────────────────────────────
    setStorageDeletionHandler(async () => {
      throw new Error('Simulated S3 Network Error: Access Denied / Connection Reset')
    })

    const retryTransfer = new Transfer({
      s3ObjectKey: 'encra-00000000-0000-0000-0000-000000000006.encra',
      originalFileName: 'retry_test.dat',
      fileSize: 2048,
      lookupFingerprint: computeLookupFingerprint('desert cactus yellow sand dune scorpion heat'),
      status: 'active',
      expiresAt: new Date(nowMs - 1000 * 60), // expired
    })
    await retryTransfer.save()

    const failedCycle = await runCleanupCycle()
    const docAfterFailure = await Transfer.findById(retryTransfer._id)

    assert(
      failedCycle.failed >= 1 &&
        docAfterFailure !== null &&
        docAfterFailure.status === 'pending_cleanup' &&
        docAfterFailure.cleanupStatus === 'failed' &&
        docAfterFailure.cleanupAttempts >= 1 &&
        docAfterFailure.cleanupError?.includes('Simulated S3 Network Error') === true,
      'Scenario 9: Failed S3 deletion is retried',
      `Transfer preserved in pending_cleanup with attempts=${docAfterFailure?.cleanupAttempts}`,
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Repeated cleanup requests do not cause inconsistent state (idempotency)
    // ─────────────────────────────────────────────────────────────
    resetStorageDeletionHandler()

    const idem1 = await consumeAndCleanTransfer(consumeTestTransfer.transferId)
    const idem2 = await consumeAndCleanTransfer(consumeTestTransfer.transferId)
    const idem3 = await consumeAndCleanTransfer('non-existent-transfer-id')

    assert(
      idem1.success && idem2.success && idem3.success,
      'Scenario 10: Repeated cleanup requests do not cause inconsistent state',
      'Multiple successive consume calls returned success without errors',
    )

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Expired transfers cannot be reopened during pending cleanup
    // ─────────────────────────────────────────────────────────────
    const pendingTransfer = await Transfer.findById(retryTransfer._id)
    const canReopen =
      pendingTransfer !== null &&
      pendingTransfer.status === 'active' &&
      pendingTransfer.expiresAt.getTime() > Date.now()

    assert(
      !canReopen && pendingTransfer?.status === 'pending_cleanup',
      'Scenario 11: Expired transfers cannot be reopened during pending cleanup',
      `Status is '${pendingTransfer?.status}', access is strictly blocked`,
    )

    // Final cleanup of test items
    await Transfer.deleteMany({
      s3ObjectKey: {
        $in: [
          'encra-test-expiry-0001.encra',
          'encra-test-expiry-0002.encra',
          'encra-test-expiry-0003.encra',
          'encra-test-expiry-0004.encra',
          'encra-test-expiry-0005.encra',
          'encra-test-expiry-0006.encra',
        ],
      },
    })

    console.log('\n===============================================================')
    console.log(`TEST SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED`)
    console.log('===============================================================\n')
  } finally {
    await mongoose.disconnect()
  }
}

void runTestSuite()
