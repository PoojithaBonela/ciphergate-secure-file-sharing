import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { generatePresignedUploadUrl, verifyObjectExists, MAX_PACKAGE_SIZE_BYTES } from '../services/s3Service'
import { HttpError } from '../middleware/errorHandler'

const uploadsRouter = Router()

const presignSchema = z.object({
  fileSize: z
    .number({ required_error: 'fileSize is required.' })
    .int('fileSize must be an integer.')
    .positive('fileSize must be greater than 0.')
    .max(MAX_PACKAGE_SIZE_BYTES, `Encrypted package size exceeds ${MAX_PACKAGE_SIZE_BYTES / (1024 * 1024)} MB limit.`),
  contentType: z
    .string()
    .optional()
    .default('application/json')
    .refine(
      (val) => ['application/json', 'application/octet-stream', 'application/x-encra'].includes(val),
      { message: 'Invalid content type. Expected application/json or application/octet-stream.' },
    ),
})

const verifySchema = z.object({
  objectKey: z
    .string({ required_error: 'objectKey is required.' })
    .regex(/^encra-[a-f0-9-]+\.encra$/, 'Invalid object key format.'),
})

/**
 * POST /api/uploads/presign
 * Generates a short-lived presigned S3 PutObject URL for uploading an encrypted .encra file.
 */
uploadsRouter.post('/presign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = presignSchema.safeParse(req.body)
    if (!parseResult.success) {
      throw new HttpError(
        400,
        parseResult.error.errors[0]?.message ?? 'Invalid request data.',
        parseResult.error.errors,
      )
    }

    const { fileSize, contentType } = parseResult.data
    const result = await generatePresignedUploadUrl({
      fileSize,
      contentType,
    })

    res.status(200).json({
      status: 'success',
      uploadUrl: result.uploadUrl,
      objectKey: result.objectKey,
      expiresIn: result.expiresIn,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/uploads/verify
 * Confirms that the encrypted file was successfully uploaded to S3.
 */
uploadsRouter.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = verifySchema.safeParse(req.body)
    if (!parseResult.success) {
      throw new HttpError(
        400,
        parseResult.error.errors[0]?.message ?? 'Invalid request data.',
        parseResult.error.errors,
      )
    }

    const { objectKey } = parseResult.data
    const check = await verifyObjectExists(objectKey)

    if (!check.exists) {
      res.status(404).json({
        status: 'error',
        message: 'Object not found in S3 bucket.',
        uploaded: false,
      })
      return
    }

    res.status(200).json({
      status: 'success',
      message: 'Upload confirmed in S3.',
      uploaded: true,
      objectKey,
      size: check.size,
    })
  } catch (error) {
    next(error)
  }
})

export default uploadsRouter
