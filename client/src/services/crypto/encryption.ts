/**
 * Encra 3.0 Client-Side Cryptographic Service
 *
 * Implements AES-256-GCM authenticated encryption using the browser Web Crypto API.
 * Uses PBKDF2-HMAC-SHA-256 with 600,000 iterations for password key derivation.
 * Generates fresh cryptographically secure 16-byte salt and 12-byte IV per encryption.
 * Encrypts raw file bytes entirely in-memory on the client device.
 */

export interface EncraMetadata {
  originalName: string
  mimeType: string
  originalSize: number
  encryptedAt: string
}

export interface EncraCryptoParams {
  cipher: 'AES-256-GCM'
  keyDerivation: 'PBKDF2-HMAC-SHA-256'
  iterations: number
  tagLength: number
  salt: string // Base64
  iv: string // Base64
}

export interface EncraPackage {
  encraVersion: '1.0'
  metadata: EncraMetadata
  crypto: EncraCryptoParams
  ciphertext: string // Base64 ciphertext with 128-bit authentication tag appended
}

export interface EncryptionResult {
  packageBlob: Blob
  encryptedPackage: EncraPackage
  downloadFilename: string
  originalSize: number
  encryptedSize: number
  algorithm: string
  durationMs: number
}

const PBKDF2_ITERATIONS = 600000
const TAG_LENGTH_BITS = 128
const SALT_BYTE_LENGTH = 16
const IV_BYTE_LENGTH = 12

/**
 * Converts a Uint8Array into a Base64 string in chunks to prevent call-stack overflows.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  const chunkSize = 0x8000 // 32KB chunks
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunkSize, len)) as unknown as number[]
    )
  }
  return btoa(binary)
}

/**
 * Converts a Base64 string back into a Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Encrypts a file using client-side Web Crypto API (AES-256-GCM, PBKDF2-HMAC-SHA-256).
 *
 * @param file The file to encrypt (max 10MB)
 * @param password The secret passphrase chosen by the sender
 * @returns An EncryptionResult containing the downloadable .encra package
 */
export async function encryptFile(
  file: File,
  password: string
): Promise<EncryptionResult> {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API is not supported in this browser environment.')
  }

  if (!file) {
    throw new Error('No file provided for encryption.')
  }

  if (!password || password.length < 8) {
    throw new Error('A password with at least 8 characters is required.')
  }

  const startTime = performance.now()

  // 1. Read file raw bytes
  const fileBuffer = await file.arrayBuffer()

  // 2. Generate cryptographically secure random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH))

  // 3. Import passphrase into a temporary raw key for PBKDF2 derivation
  const enc = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  // 4. Derive non-extractable AES-256-GCM key with 600,000 iterations
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // Non-extractable
    ['encrypt']
  )

  // 5. Encrypt file raw bytes with AES-256-GCM (appends 128-bit authentication tag)
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: TAG_LENGTH_BITS,
    },
    derivedKey,
    fileBuffer
  )

  const ciphertextBase64 = uint8ArrayToBase64(new Uint8Array(encryptedBuffer))
  const saltBase64 = uint8ArrayToBase64(salt)
  const ivBase64 = uint8ArrayToBase64(iv)

  // 6. Assemble portable .encra package
  const encraPackage: EncraPackage = {
    encraVersion: '1.0',
    metadata: {
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      originalSize: file.size,
      encryptedAt: new Date().toISOString(),
    },
    crypto: {
      cipher: 'AES-256-GCM',
      keyDerivation: 'PBKDF2-HMAC-SHA-256',
      iterations: PBKDF2_ITERATIONS,
      tagLength: TAG_LENGTH_BITS,
      salt: saltBase64,
      iv: ivBase64,
    },
    ciphertext: ciphertextBase64,
  }

  const packageJson = JSON.stringify(encraPackage, null, 2)
  const packageBlob = new Blob([packageJson], { type: 'application/json' })

  const downloadFilename = `${file.name}.encra`
  const endTime = performance.now()

  return {
    packageBlob,
    encryptedPackage: encraPackage,
    downloadFilename,
    originalSize: file.size,
    encryptedSize: packageBlob.size,
    algorithm: `AES-256-GCM (PBKDF2 600k rounds)`,
    durationMs: Math.round(endTime - startTime),
  }
}

/**
 * Triggers a browser file download for a generated .encra package.
 */
export function downloadEncraFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Allow browser download manager sufficient time to acquire the stream before revocation
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export interface DecryptionResult {
  decryptedBlob: Blob
  filename: string
  mimeType: string
  originalSize: number
  durationMs: number
}

/**
 * Decrypts an .encra package client-side using Web Crypto API.
 * Derive AES key using PBKDF2 with package salt and iterations, then decrypt with AES-256-GCM.
 * Never transmits password or derived key.
 */
export async function decryptEncraPackage(
  packageData: EncraPackage | string,
  password: string
): Promise<DecryptionResult> {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API is not supported in this browser environment.')
  }

  if (!password) {
    throw new Error('Password is required for decryption.')
  }

  const startTime = performance.now()

  // 1. Parse package if provided as JSON string
  let pkg: EncraPackage
  if (typeof packageData === 'string') {
    try {
      pkg = JSON.parse(packageData) as EncraPackage
    } catch {
      throw new Error('Invalid encrypted package format. Failed to parse JSON.')
    }
  } else {
    pkg = packageData
  }

  // 2. Validate package format
  if (!pkg.crypto || !pkg.ciphertext || !pkg.metadata) {
    throw new Error('Malformed .encra package structure.')
  }

  if (pkg.crypto.cipher !== 'AES-256-GCM') {
    throw new Error(`Unsupported cipher algorithm: ${pkg.crypto.cipher}`)
  }

  const salt = base64ToUint8Array(pkg.crypto.salt)
  const iv = base64ToUint8Array(pkg.crypto.iv)
  const ciphertext = base64ToUint8Array(pkg.ciphertext)

  // 3. Derive key via PBKDF2-HMAC-SHA-256
  const enc = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: pkg.crypto.iterations || PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['decrypt']
  )

  // 4. Decrypt raw bytes (AES-256-GCM authenticated decryption)
  let decryptedBuffer: ArrayBuffer
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        tagLength: pkg.crypto.tagLength || TAG_LENGTH_BITS,
      },
      derivedKey,
      ciphertext as unknown as BufferSource
    )
  } catch {
    // OperationError triggered by authentication tag mismatch (wrong password or corrupted package)
    throw new Error(
      'Unable to decrypt this file. Check your credentials or verify that the encrypted package is intact.'
    )
  }

  const mimeType = pkg.metadata.mimeType || 'application/octet-stream'
  const decryptedBlob = new Blob([decryptedBuffer], { type: mimeType })
  const endTime = performance.now()

  return {
    decryptedBlob,
    filename: pkg.metadata.originalName || 'decrypted_file',
    mimeType,
    originalSize: pkg.metadata.originalSize || decryptedBlob.size,
    durationMs: Math.round(endTime - startTime),
  }
}

/**
 * Triggers a browser file download for a decrypted file.
 */
export function downloadDecryptedFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Allow browser download manager sufficient time to acquire the stream before revocation
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

