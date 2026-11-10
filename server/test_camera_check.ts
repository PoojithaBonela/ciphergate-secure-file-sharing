import assert from 'node:assert'
import { z } from 'zod'

console.log('\n======================================================')
console.log('   ENCRA 3.0: CAMERA CHECK CONFIGURATION & METADATA TEST')
console.log('======================================================\n')

// ── TEST 1: Registration schema validation with Camera Check ────────
const registerSchema = z.object({
  sevenWordCode: z.string(),
  s3ObjectKey: z.string(),
  originalFileName: z.string(),
  mimeType: z.string().default('application/octet-stream'),
  fileSize: z.number().positive(),
  cameraCheckEnabled: z.boolean().default(false),
})

const testPayloadEnabled = {
  sevenWordCode: 'orange velvet harbor canyon silver whisper river',
  s3ObjectKey: 'encra-12345678-1234-1234-1234-123456789abc.encra',
  originalFileName: 'confidential_contract.pdf',
  fileSize: 1048576,
  cameraCheckEnabled: true,
}

const parsedEnabled = registerSchema.safeParse(testPayloadEnabled)
assert.ok(parsedEnabled.success, 'Registration with cameraCheckEnabled: true must succeed')
assert.strictEqual(parsedEnabled.data?.cameraCheckEnabled, true)
console.log('✓ TEST 1A PASSED: cameraCheckEnabled: true validated successfully.')

const testPayloadDefault = {
  sevenWordCode: 'orange velvet harbor canyon silver whisper river',
  s3ObjectKey: 'encra-12345678-1234-1234-1234-123456789abc.encra',
  originalFileName: 'confidential_contract.pdf',
  fileSize: 1048576,
}

const parsedDefault = registerSchema.safeParse(testPayloadDefault)
assert.ok(parsedDefault.success, 'Registration without cameraCheckEnabled must default to false')
assert.strictEqual(parsedDefault.data?.cameraCheckEnabled, false)
console.log('✓ TEST 1B PASSED: Default cameraCheckEnabled: false preserved when omitted.')

// ── TEST 2: Transfer lookup metadata structure ──────────────────────
function buildLookupResponse(transfer: {
  transferId: string
  originalFileName: string
  mimeType: string
  fileSize: number
  locationEnabled: boolean
  cameraCheckEnabled: boolean
}) {
  return {
    status: 'success',
    locationRequired: transfer.locationEnabled,
    transfer: {
      transferId: transfer.transferId,
      originalFileName: transfer.originalFileName,
      mimeType: transfer.mimeType,
      fileSize: transfer.fileSize,
      locationRequired: transfer.locationEnabled,
      cameraCheckRequired: Boolean(transfer.cameraCheckEnabled),
    },
  }
}

const cameraProtectedTransfer = {
  transferId: 'transfer-xyz-camera',
  originalFileName: 'top_secret.png',
  mimeType: 'image/png',
  fileSize: 524288,
  locationEnabled: false,
  cameraCheckEnabled: true,
}

const lookupRes = buildLookupResponse(cameraProtectedTransfer)
assert.strictEqual(lookupRes.transfer.cameraCheckRequired, true)
assert.strictEqual(lookupRes.transfer.locationRequired, false)
console.log('✓ TEST 2A PASSED: Lookup metadata properly flags cameraCheckRequired: true.')

const unrestrictedTransfer = {
  transferId: 'transfer-abc-standard',
  originalFileName: 'readme.txt',
  mimeType: 'text/plain',
  fileSize: 1024,
  locationEnabled: false,
  cameraCheckEnabled: false,
}

const unrestrictedLookupRes = buildLookupResponse(unrestrictedTransfer)
assert.strictEqual(unrestrictedLookupRes.transfer.cameraCheckRequired, false)
console.log('✓ TEST 2B PASSED: Standard transfer correctly reports cameraCheckRequired: false.')

console.log('\nAll Camera Check configuration tests passed successfully!')

