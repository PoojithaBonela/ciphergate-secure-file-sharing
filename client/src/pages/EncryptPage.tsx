import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  CheckCircle2,
  Download,
  RotateCcw,
  AlertCircle,
  FileText,
  CloudUpload,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import FileUploadZone from '@/components/encrypt/FileUploadZone'
import PasswordSetupPanel from '@/components/encrypt/PasswordSetupPanel'
import { evaluatePassword } from '@/components/encrypt/passwordUtils'
import SecurityControlsPanel, { SecurityControlsState } from '@/components/encrypt/SecurityControlsPanel'
import { encryptFile, downloadEncraFile, EncryptionResult } from '@/services/crypto/encryption'
import { getPresignedUploadUrl, uploadToS3, verifyS3Upload } from '@/services/api/uploadService'
import { registerTransfer, isValidSevenWordCode } from '@/services/api/transferService'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

type ProcessingStage =
  | 'idle'
  | 'encrypting'
  | 'requesting_presign'
  | 'uploading'
  | 'verifying'
  | 'registering'
  | 'completed'
  | 'upload_error'

export default function EncryptPage() {
  // State management
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [securityControls, setSecurityControls] = useState<SecurityControlsState>({
    accessLevel: 'standard',
    sevenWordCode: '',
    verificationMethod: 'email',
    verifiedEmail: '',
    verifiedPhone: '',
    expiryEnabled: false,
    expiryDate: '',
    locationEnabled: false,
    locationQuery: '',
    radiusKm: 5,
    cameraCheckEnabled: false,
    cameraConsentChecked: false,
    notificationsEnabled: false,
    notificationType: 'email',
    notificationTarget: '',
  })

  // Real client-side encryption, S3 upload & MongoDB registration states
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [encryptionResult, setEncryptionResult] = useState<EncryptionResult | null>(null)
  const [encryptionError, setEncryptionError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [registeredTransferId, setRegisteredTransferId] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  // Validation
  const passwordEvaluation = useMemo(() => evaluatePassword(password), [password])
  const isPasswordValid = passwordEvaluation.hasMinLength && password === confirmPassword

  const isCodeValid = useMemo(() => {
    return isValidSevenWordCode(securityControls.sevenWordCode)
  }, [securityControls.sevenWordCode])

  const isVerifiedValid = useMemo(() => {
    if (securityControls.accessLevel === 'standard') return true
    if (securityControls.verificationMethod === 'email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(securityControls.verifiedEmail.trim())
    }
    const cleanPhone = securityControls.verifiedPhone.trim()
    const digits = cleanPhone.replace(/\D/g, '')
    return digits.length >= 7 && /^\+?[0-9\s\-()]+$/.test(cleanPhone)
  }, [
    securityControls.accessLevel,
    securityControls.verificationMethod,
    securityControls.verifiedEmail,
    securityControls.verifiedPhone,
  ])

  const isReadyToEncrypt = useMemo(() => {
    return Boolean(file) && isPasswordValid && !fileError && isCodeValid && isVerifiedValid
  }, [file, isPasswordValid, fileError, isCodeValid, isVerifiedValid])

  const isSubmitting = [
    'encrypting',
    'requesting_presign',
    'uploading',
    'verifying',
    'registering',
  ].includes(processingStage)

  // Direct S3 Upload & Registration Handler
  const performUploadAndRegistration = async (blob: Blob, currentFile: File) => {
    setUploadError(null)
    setProcessingStage('requesting_presign')
    setUploadProgress(0)

    try {
      // 1. Request presigned upload URL from backend
      const presign = await getPresignedUploadUrl(blob.size)

      // 2. Direct binary PUT upload to S3 with live progress
      setProcessingStage('uploading')
      await uploadToS3(presign.uploadUrl, blob, (percent) => {
        setUploadProgress(percent)
      })

      // 3. Confirm object existence in S3
      setProcessingStage('verifying')
      await verifyS3Upload(presign.objectKey)

      // 4. Register transfer in MongoDB with HMAC fingerprint
      setProcessingStage('registering')
      const registration = await registerTransfer({
        sevenWordCode: securityControls.sevenWordCode,
        s3ObjectKey: presign.objectKey,
        originalFileName: currentFile.name,
        mimeType: currentFile.type || 'application/octet-stream',
        fileSize: blob.size,
        expiresAt:
          securityControls.expiryEnabled && securityControls.expiryDate
            ? new Date(securityControls.expiryDate).toISOString()
            : null,
      })

      setRegisteredTransferId(registration.transferId)
      setProcessingStage('completed')
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Upload or transfer registration failed.'
      setUploadError(msg)
      setProcessingStage('upload_error')
    }
  }

  // Real client-side Web Crypto API execution & automated S3 upload + registration
  const handleEncrypt = async () => {
    if (!isReadyToEncrypt || !file) return

    setEncryptionError(null)
    setUploadError(null)
    setProcessingStage('encrypting')

    let encResult: EncryptionResult
    try {
      // Step 1: Encrypt file entirely on-device using Web Crypto API
      encResult = await encryptFile(file, password)
      setEncryptionResult(encResult)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'An error occurred during file encryption.'
      setEncryptionError(msg)
      setProcessingStage('idle')
      return
    }

    // Step 2: Upload to S3 and register in MongoDB
    await performUploadAndRegistration(encResult.packageBlob, file)
  }

  // Action: Retry S3 upload and registration for the already-encrypted file
  const handleRetryUpload = async () => {
    if (!encryptionResult || !file) return
    await performUploadAndRegistration(encryptionResult.packageBlob, file)
  }

  // Action: Trigger file download of .encra package
  const handleDownload = () => {
    if (!encryptionResult) return
    downloadEncraFile(encryptionResult.packageBlob, encryptionResult.downloadFilename)
  }

  // Action: Reset workflow to encrypt another file
  const handleReset = () => {
    setFile(null)
    setFileError(null)
    setPassword('')
    setConfirmPassword('')
    setEncryptionResult(null)
    setEncryptionError(null)
    setUploadError(null)
    setRegisteredTransferId(null)
    setUploadProgress(0)
    setProcessingStage('idle')
  }

  const handleCopyCode = () => {
    if (!securityControls.sevenWordCode) return
    navigator.clipboard.writeText(securityControls.sevenWordCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050913] text-[#F5F7FA]">
      <Navbar />

      {/* Subtle top ambient radial lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px]"
          style={{
            background: 'radial-gradient(ellipse, rgba(41, 151, 255, 0.08) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute top-[45%] left-1/4 -translate-x-1/2 w-[600px] h-[400px]"
          style={{
            background: 'radial-gradient(ellipse, rgba(41, 151, 255, 0.04) 0%, transparent 70%)',
            filter: 'blur(50px)',
          }}
        />
      </div>

      <main className="relative z-10 flex-1 max-w-4xl mx-auto w-full px-5 sm:px-6 lg:px-8 pt-24 pb-20">
        {/* ── Compact Header Row ──────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8 pb-3">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-[#0A1220] border border-[#202B3D] group-hover:border-[#2997FF]/40 flex items-center justify-center text-[#8CA4C5] group-hover:text-[#F5F7FA] transition-colors">
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            </div>
            <span>Back to Home</span>
          </Link>

          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-[#0A1220] border border-[#202B3D] text-[#8CA4C5]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2997FF]" />
            <span>Zero-Knowledge Architecture</span>
          </div>
        </div>

        {/* ── Page Title & Subtitle ───────────────────────────────────── */}
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F5F7FA] mb-2.5">
            Encrypt Your File
          </h1>
          <p className="text-sm sm:text-base text-[#8CA4C5] max-w-2xl leading-relaxed">
            Encrypt your file locally with AES-256-GCM before it leaves your device, then store the sealed package in private cloud storage.
          </p>
        </div>

        {/* ── Top-level Encryption Error Notification ─────────────────── */}
        {encryptionError && (
          <div className="mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Encryption Error</p>
              <p className="text-xs text-rose-300/90 mt-0.5">{encryptionError}</p>
            </div>
          </div>
        )}

        {/* ── CONDITIONAL RENDER: ACTIVE PROGRESS, COMPLETED SUCCESS, ERROR STATE, OR INPUT FORMS ── */}
        {isSubmitting ? (
          /* ── ACTIVE PROCESSING STATE ─────────────────────────────────── */
          <div className="rounded-2xl bg-[#0A1220]/90 backdrop-blur-md border border-[#202B3D] p-8 sm:p-12 shadow-[0_0_40px_rgba(41,151,255,0.15)] text-center animate-in fade-in duration-300">
            <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#2997FF]/15 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-[#0E1A2E] border border-[#2997FF]/40 flex items-center justify-center shadow-[0_0_25px_rgba(41,151,255,0.3)]">
                {processingStage === 'encrypting' ? (
                  <Lock className="w-7 h-7 text-[#2997FF] animate-pulse" />
                ) : (
                  <CloudUpload className="w-7 h-7 text-[#2997FF] animate-bounce" />
                )}
              </div>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-[#F5F7FA] mb-2">
              {processingStage === 'encrypting' && 'Encrypting File Client-Side...'}
              {processingStage === 'requesting_presign' && 'Authorizing S3 Upload...'}
              {processingStage === 'uploading' && `Uploading Encrypted Package (${uploadProgress}%)...`}
              {processingStage === 'verifying' && 'Verifying S3 Cloud Storage...'}
              {processingStage === 'registering' && 'Registering Transfer & Secret Code...'}
            </h2>

            <p className="text-xs sm:text-sm text-[#8CA4C5] max-w-md mx-auto mb-6 leading-relaxed">
              {processingStage === 'encrypting' &&
                'Deriving non-extractable keys via PBKDF2 (600,000 rounds) and encrypting raw bytes with AES-256-GCM in memory.'}
              {processingStage === 'requesting_presign' &&
                'Requesting a short-lived, authenticated PutObject URL from the Encra backend.'}
              {processingStage === 'uploading' &&
                'Transmitting the encrypted .encra package directly to the private AWS S3 bucket.'}
              {processingStage === 'verifying' &&
                'Confirming package integrity and secure cloud storage in AWS ap-southeast-2.'}
              {processingStage === 'registering' &&
                'Generating HMAC-SHA-256 lookup fingerprint and registering record with MongoDB Atlas.'}
            </p>

            {/* Dynamic Progress Bar */}
            <div className="w-full max-w-md mx-auto mb-4 bg-[#050913] rounded-full h-2.5 overflow-hidden border border-[#202B3D]">
              <div
                className="bg-gradient-to-r from-[#2997FF] to-[#00D4FF] h-full transition-all duration-300 rounded-full shadow-[0_0_12px_rgba(41,151,255,0.6)]"
                style={{
                  width:
                    processingStage === 'encrypting'
                      ? '25%'
                      : processingStage === 'requesting_presign'
                        ? '45%'
                        : processingStage === 'uploading'
                          ? `${Math.max(45, 45 + uploadProgress * 0.4)}%`
                          : processingStage === 'verifying'
                            ? '88%'
                            : processingStage === 'registering'
                              ? '96%'
                              : '100%',
                }}
              />
            </div>

            <div className="inline-flex items-center gap-2 text-xs text-[#8CA4C5]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2997FF]" />
              <span>Zero-knowledge: Original file, password, and keys never leave your browser.</span>
            </div>
          </div>
        ) : processingStage === 'completed' && encryptionResult ? (
          /* ── SUCCESS STATE: ENCRYPTION SUCCESSFUL ─────────────────────── */
          <div className="rounded-2xl bg-[#0A1220]/90 backdrop-blur-md border border-[#202B3D] p-6 sm:p-9 shadow-[0_0_40px_rgba(20,184,166,0.12)] animate-in fade-in duration-300">
            {/* Success Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#202B3D]">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(20,184,166,0.25)]">
                  <CheckCircle2 className="w-6 h-6" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[#F5F7FA]">
                    Encryption Successful
                  </h2>
                  <p className="text-xs sm:text-sm text-[#8CA4C5] mt-0.5">
                    Your file is encrypted and ready for secure access.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {registeredTransferId && (
                  <span className="text-[11px] font-mono text-[#8CA4C5] px-2.5 py-1 rounded-md bg-[#050913] border border-[#202B3D]">
                    ID: {registeredTransferId.slice(0, 8)}...
                  </span>
                )}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/25 text-xs text-teal-400 font-semibold shadow-[0_0_12px_rgba(20,184,166,0.15)]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Protected</span>
                </div>
              </div>
            </div>

            {/* Seven-Word Secret Code Card */}
            {securityControls.sevenWordCode && (
              <div className="my-6 p-4 sm:p-5 rounded-xl bg-[#050913]/90 border border-[#2997FF]/30 shadow-[0_0_20px_rgba(41,151,255,0.08)]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#2997FF]">
                    <KeyRound className="w-4 h-4" />
                    <span className="uppercase tracking-wider">Seven-Word Secret Code</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#2997FF]/10 text-[#2997FF] hover:bg-[#2997FF]/20 border border-[#2997FF]/30 transition-colors cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-teal-400" />
                        <span className="text-teal-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-[#0A1220] border border-[#202B3D] text-[#F5F7FA] font-mono text-xs sm:text-sm tracking-wide break-words select-all">
                  {securityControls.sevenWordCode}
                </div>

                <p className="mt-2.5 text-[11px] text-[#8CA4C5] leading-relaxed">
                  Share this 7-word secret code and your file password with the recipient. The recipient will enter both credentials on the Decrypt page to retrieve and decipher the file.
                </p>
              </div>
            )}

            {/* File & Cipher Details Grid */}
            <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original File Info */}
              <div className="p-4 rounded-xl bg-[#050913]/90 border border-[#202B3D]/80">
                <div className="flex items-center gap-2 mb-2 text-[#8CA4C5]">
                  <FileText className="w-4 h-4 text-[#2997FF]" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Original Source File
                  </span>
                </div>
                <p className="text-sm font-semibold text-[#F5F7FA] truncate mb-1">
                  {encryptionResult.encryptedPackage.metadata.originalName}
                </p>
                <div className="flex items-center gap-3 text-xs text-[#8CA4C5]">
                  <span>Size: {formatBytes(encryptionResult.originalSize)}</span>
                  <span>·</span>
                  <span className="truncate">Type: {encryptionResult.encryptedPackage.metadata.mimeType}</span>
                </div>
              </div>

              {/* Encrypted Package Info */}
              <div className="p-4 rounded-xl bg-[#050913]/90 border border-[#202B3D]/80">
                <div className="flex items-center gap-2 mb-2 text-[#8CA4C5]">
                  <Lock className="w-4 h-4 text-[#2997FF]" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Encrypted Package (.encra)
                  </span>
                </div>
                <p className="text-sm font-semibold text-[#2997FF] truncate mb-1">
                  {encryptionResult.downloadFilename}
                </p>
                <div className="flex items-center gap-3 text-xs text-[#8CA4C5]">
                  <span>Package Size: {formatBytes(encryptionResult.encryptedSize)}</span>
                  <span>·</span>
                  <span>Format: ENCRA v1.0</span>
                </div>
              </div>
            </div>

            {/* Cryptographic Parameters Breakdown */}
            <div className="p-4 sm:p-5 rounded-xl bg-[#050913]/60 border border-[#202B3D]/70 text-xs space-y-2.5 mb-7">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#8CA4C5] mb-1">
                Cryptographic Verification Parameters
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[#202B3D]/40">
                  <span className="text-[#8CA4C5]">Cipher:</span>
                  <span className="font-semibold text-[#F5F7FA]">AES-256-GCM (128-bit tag)</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#202B3D]/40">
                  <span className="text-[#8CA4C5]">Key Derivation:</span>
                  <span className="font-semibold text-[#F5F7FA]">PBKDF2-HMAC-SHA-256</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#202B3D]/40">
                  <span className="text-[#8CA4C5]">Derivation Rounds:</span>
                  <span className="font-semibold text-[#F5F7FA]">600,000 iterations</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#202B3D]/40">
                  <span className="text-[#8CA4C5]">Salt & IV:</span>
                  <span className="font-semibold text-[#F5F7FA]">16-byte Salt / 12-byte IV</span>
                </div>
              </div>

              <p className="text-[11px] text-[#8CA4C5] pt-1 italic">
                The plaintext file and derived key were destroyed from memory immediately after encryption.
              </p>
            </div>

            {/* Actions: Download Local Copy & Encrypt Another */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#111E30] hover:bg-[#162740] border border-[#202B3D] text-[#F5F7FA] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Encrypt Another File</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3 rounded-xl bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white text-xs sm:text-sm font-semibold tracking-wide transition-all shadow-[0_0_24px_rgba(41,151,255,0.35)] active:scale-[0.98] cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Encrypted File (.encra)</span>
              </button>
            </div>
          </div>
        ) : processingStage === 'upload_error' && encryptionResult ? (
          /* ── UPLOAD FAILED STATE (ENCRYPTION PRESERVED & RETRY OPTION) ─ */
          <div className="rounded-2xl bg-[#0A1220]/90 backdrop-blur-md border border-amber-500/30 p-6 sm:p-9 shadow-[0_0_40px_rgba(245,158,11,0.1)] animate-in fade-in duration-300">
            {/* Warning Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#202B3D]">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                  <AlertTriangle className="w-6 h-6" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[#F5F7FA]">
                    File Encrypted Locally (Cloud Upload Incomplete)
                  </h2>
                  <p className="text-xs sm:text-sm text-[#8CA4C5]">
                    Your file is safely encrypted on your device. Direct upload to cloud storage encountered an issue.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRetryUpload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2997FF] hover:bg-[#38A0FF] text-white text-xs font-semibold transition-all shadow-[0_0_16px_rgba(41,151,255,0.3)] self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Cloud Upload</span>
              </button>
            </div>

            {/* Error Details */}
            {uploadError && (
              <div className="my-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs">
                <p className="font-semibold mb-1">Upload Error Details:</p>
                <p className="text-amber-300/90">{uploadError}</p>
                <p className="mt-2 text-[11px] text-[#8CA4C5]">
                  You can download your encrypted file right away or retry uploading to cloud storage.
                </p>
              </div>
            )}

            {/* File Info Cards */}
            <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#050913]/90 border border-[#202B3D]/80">
                <div className="flex items-center gap-2 mb-2 text-[#8CA4C5]">
                  <FileText className="w-4 h-4 text-[#2997FF]" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Original Source File
                  </span>
                </div>
                <p className="text-sm font-semibold text-[#F5F7FA] truncate mb-1">
                  {encryptionResult.encryptedPackage.metadata.originalName}
                </p>
                <div className="flex items-center gap-3 text-xs text-[#8CA4C5]">
                  <span>Size: {formatBytes(encryptionResult.originalSize)}</span>
                  <span>·</span>
                  <span className="truncate">Type: {encryptionResult.encryptedPackage.metadata.mimeType}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#050913]/90 border border-[#202B3D]/80">
                <div className="flex items-center gap-2 mb-2 text-[#8CA4C5]">
                  <Lock className="w-4 h-4 text-[#2997FF]" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Encrypted Package (.encra)
                  </span>
                </div>
                <p className="text-sm font-semibold text-[#2997FF] truncate mb-1">
                  {encryptionResult.downloadFilename}
                </p>
                <div className="flex items-center gap-3 text-xs text-[#8CA4C5]">
                  <span>Package Size: {formatBytes(encryptionResult.encryptedSize)}</span>
                  <span>·</span>
                  <span>Format: ENCRA v1.0</span>
                </div>
              </div>
            </div>

            {/* Actions: Download Local Copy & Reset */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#111E30] hover:bg-[#162740] border border-[#202B3D] text-[#F5F7FA] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Encrypt Another File</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3 rounded-xl bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white text-xs sm:text-sm font-semibold tracking-wide transition-all shadow-[0_0_24px_rgba(41,151,255,0.35)] active:scale-[0.98] cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Encrypted File (.encra)</span>
              </button>
            </div>
          </div>
        ) : (
          /* ── INPUT FORMS: UPLOAD, PASSWORD, CONTROLS ───────────────── */
          <>
            {/* 1. File Upload Area */}
            <section aria-label="Upload File" className="mb-8">
              <FileUploadZone
                file={file}
                onFileSelect={setFile}
                error={fileError}
                onError={setFileError}
              />
            </section>

            {/* 2. Password Setup Panel */}
            <section aria-label="Set Password" className="mb-8">
              <PasswordSetupPanel
                password={password}
                confirmPassword={confirmPassword}
                onPasswordChange={setPassword}
                onConfirmPasswordChange={setConfirmPassword}
              />
            </section>

            {/* 3. Additional Security Controls & Bottom Action Bar */}
            <section aria-label="Additional Security Controls">
              <SecurityControlsPanel
                controls={securityControls}
                onChange={setSecurityControls}
                isReadyToEncrypt={isReadyToEncrypt}
                isSubmitting={isSubmitting}
                onSubmit={handleEncrypt}
              />
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
