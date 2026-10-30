/**
 * Encra 3.0 Encrypted Package Upload Service
 *
 * Requests short-lived presigned PutObject URLs from the backend
 * and uploads the encrypted .encra package directly to S3.
 */

export interface PresignResponse {
  status: 'success'
  uploadUrl: string
  objectKey: string
  expiresIn: number
}

export interface UploadResult {
  objectKey: string
  size: number
}

/**
 * Requests a presigned S3 upload URL from the Encra backend.
 * Only sends the package size and content type. Never sends passwords, keys, or file data.
 */
export async function getPresignedUploadUrl(fileSize: number): Promise<PresignResponse> {
  const response = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileSize,
      contentType: 'application/json',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody.message || `Failed to obtain upload authorization (HTTP ${response.status})`)
  }

  return response.json()
}

/**
 * Uploads the encrypted .encra package blob directly to AWS S3 using the presigned URL.
 * Uses XMLHttpRequest to provide real-time upload progress feedback.
 */
export async function uploadToS3(
  uploadUrl: string,
  packageBlob: Blob,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl, true)
    xhr.setRequestHeader('Content-Type', 'application/json')

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve()
      } else {
        reject(
          new Error(
            `Cloud storage upload rejected by S3 (HTTP ${xhr.status} ${xhr.statusText}).`,
          ),
        )
      }
    }

    xhr.onerror = () => {
      reject(
        new Error(
          'Network error occurred during direct upload to S3. Verify network connection and S3 CORS configuration.',
        ),
      )
    }

    xhr.ontimeout = () => {
      reject(new Error('S3 upload timed out after 60 seconds.'))
    }

    xhr.timeout = 65000 // Slightly longer than presigned URL expiry
    xhr.send(packageBlob)
  })
}

/**
 * Confirms that the uploaded object key exists in S3 via the backend verification endpoint.
 */
export async function verifyS3Upload(objectKey: string): Promise<boolean> {
  try {
    const response = await fetch('/api/uploads/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ objectKey }),
    })
    if (!response.ok) return false
    const data = await response.json()
    return Boolean(data.uploaded)
  } catch {
    return false
  }
}

/**
 * Orchestrates the full upload workflow for an encrypted package:
 * 1. Obtains presigned URL
 * 2. Uploads binary package directly to S3
 * 3. Verifies upload confirmation
 */
export async function uploadEncryptedPackage(
  packageBlob: Blob,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  // Step 1: Presign
  const { uploadUrl, objectKey } = await getPresignedUploadUrl(packageBlob.size)

  // Step 2: Direct PUT to S3
  await uploadToS3(uploadUrl, packageBlob, onProgress)

  // Step 3: Backend verification
  await verifyS3Upload(objectKey)

  return {
    objectKey,
    size: packageBlob.size,
  }
}
