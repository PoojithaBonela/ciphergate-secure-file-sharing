import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { config } from '../config/env'
import { HttpError } from '../middleware/errorHandler'

/**
 * Shared S3 client configured with credentials from config.
 */
export const s3Client = new S3Client({
  region: config.aws.region,
  credentials:
    config.aws.accessKeyId && config.aws.secretAccessKey
      ? {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
        }
      : undefined,
})

// Max package size: 16 MB (covers 10MB raw file + AES-GCM tag + base64 overhead ~33% + JSON metadata)
export const MAX_PACKAGE_SIZE_BYTES = 16 * 1024 * 1024
export const PRESIGNED_URL_EXPIRY_SECONDS = 60

export interface GeneratePresignedUrlInput {
  fileSize: number
  contentType?: string
}

export interface PresignedUrlResult {
  uploadUrl: string
  objectKey: string
  expiresIn: number
}

/**
 * Generates a short-lived presigned PUT URL for uploading an encrypted .encra package.
 * Enforces size limits and generates an unpredictable UUID object key.
 */
export async function generatePresignedUploadUrl(
  input: GeneratePresignedUrlInput,
): Promise<PresignedUrlResult> {
  const { fileSize, contentType = 'application/json' } = input

  if (!fileSize || fileSize <= 0) {
    throw new HttpError(400, 'Invalid file size. File size must be greater than 0 bytes.')
  }

  if (fileSize > MAX_PACKAGE_SIZE_BYTES) {
    throw new HttpError(
      400,
      `Encrypted package size exceeds the maximum limit of ${MAX_PACKAGE_SIZE_BYTES / (1024 * 1024)} MB.`,
    )
  }

  if (!config.aws.bucket) {
    throw new HttpError(500, 'AWS S3 bucket configuration is missing.')
  }

  // Generate unpredictable object key using UUID. Never use user-supplied names.
  const objectKey = `encra-${randomUUID()}.encra`

  const command = new PutObjectCommand({
    Bucket: config.aws.bucket,
    Key: objectKey,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  })

  return {
    uploadUrl,
    objectKey,
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  }
}

/**
 * Generates a short-lived presigned GET URL for securely downloading an encrypted .encra package.
 */
export async function generatePresignedDownloadUrl(objectKey: string): Promise<string> {
  if (!/^encra-[a-f0-9-]+\.encra$/.test(objectKey)) {
    throw new HttpError(400, 'Invalid object key format.')
  }

  const command = new GetObjectCommand({
    Bucket: config.aws.bucket,
    Key: objectKey,
  })

  return getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  })
}

/**
 * Deletes an object from S3. Used to clean up orphaned objects if transfer registration fails.
 */
export async function deleteS3Object(objectKey: string): Promise<void> {
  if (!/^encra-[a-f0-9-]+\.encra$/.test(objectKey)) {
    return
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: config.aws.bucket,
      Key: objectKey,
    })
    await s3Client.send(command)
  } catch (err) {
    // Log safe warning without leaking sensitive keys
    console.warn(`[s3] Warning: Failed to clean up orphaned S3 object: ${objectKey}`)
  }
}

/**
 * Checks whether an object exists in the S3 bucket and returns its metadata.
 */
export async function verifyObjectExists(objectKey: string): Promise<{ exists: boolean; size?: number }> {
  // Validate object key format (only allow our pattern to prevent path traversal)
  if (!/^encra-[a-f0-9-]+\.encra$/.test(objectKey)) {
    throw new HttpError(400, 'Invalid object key format.')
  }

  try {
    const headCommand = new HeadObjectCommand({
      Bucket: config.aws.bucket,
      Key: objectKey,
    })
    const response = await s3Client.send(headCommand)
    return {
      exists: true,
      size: response.ContentLength,
    }
  } catch (error: unknown) {
    const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (awsError.name === 'NotFound' || awsError.$metadata?.httpStatusCode === 404) {
      return { exists: false }
    }
    throw error
  }
}
