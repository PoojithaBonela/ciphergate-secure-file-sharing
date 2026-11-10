import { useState, useMemo } from 'react'
import {
  Lock,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  FileCheck,
  ShieldAlert,
  MapPin,
  Navigation,
  Compass,
  Loader2,
  RefreshCw,
  Camera,
} from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SecureFileViewer from '@/components/decrypt/SecureFileViewer'
import OtpVerificationPanel from '@/components/decrypt/OtpVerificationPanel'
import {
  lookupTransfer,
  consumeTransfer,
  verifyReceiverLocation,
  verifyTransferOtp,
  resendTransferOtp,
  isValidSevenWordCode,
  TransferMetadata,
} from '@/services/api/transferService'
import {
  decryptEncraPackage,
  DecryptionResult,
} from '@/services/crypto/encryption'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export default function DecryptPage() {
  // Input credentials
  const [sevenWordCode, setSevenWordCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [codeTouched, setCodeTouched] = useState(false)

  // Status & results
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [decryptStage, setDecryptStage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [decryptedResult, setDecryptedResult] = useState<DecryptionResult | null>(null)
  const [isSecureViewerOpen, setIsSecureViewerOpen] = useState(false)
  const [terminationReason, setTerminationReason] = useState<string | null>(null)

  // Location Verification State (Strict transfer-specific authorization)
  const [pendingLocationTransfer, setPendingLocationTransfer] = useState<TransferMetadata | null>(null)
  const [isVerifyingLocation, setIsVerifyingLocation] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [verifiedTransferId, setVerifiedTransferId] = useState<string | null>(null)
  const [authorizedDownloadUrl, setAuthorizedDownloadUrl] = useState<string | null>(null)
  const [cameraCheckRequired, setCameraCheckRequired] = useState(false)

  // OTP Verification State (Email-based Verified access)
  const [pendingOtpTransfer, setPendingOtpTransfer] = useState<TransferMetadata | null>(null)
  const [otpVerifiedTransferId, setOtpVerifiedTransferId] = useState<string | null>(null)
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null)
  const [locationDetails, setLocationDetails] = useState<{
    receiverCoordinates?: { latitude: number; longitude: number } | null
    distanceKm?: number | null
    verificationResult: 'passed' | 'failed' | 'disabled'
  } | null>(null)

  // Word count & validity
  const wordCount = useMemo(() => {
    if (!sevenWordCode.trim()) return 0
    return sevenWordCode.trim().split(/\s+/).filter(Boolean).length
  }, [sevenWordCode])

  const isCodeValid = useMemo(() => {
    return isValidSevenWordCode(sevenWordCode)
  }, [sevenWordCode])

  const isReadyToDecrypt = isCodeValid && password.length >= 1

  // Controlled 7-word input change handler
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = e.target.value

    // Invalidate prior authorization when secret code changes
    setPendingLocationTransfer(null)
    setVerifiedTransferId(null)
    setAuthorizedDownloadUrl(null)
    setCameraCheckRequired(false)
    setLocationError(null)
    setErrorMessage(null)
    setDecryptedResult(null)
    setPendingOtpTransfer(null)
    setOtpVerifiedTransferId(null)
    setActiveTransferId(null)
    setLocationDetails(null)

    if (incoming === '') {
      setSevenWordCode('')
      return
    }

    // Reject uppercase letters (do NOT silently convert to lowercase)
    if (/[A-Z]/.test(incoming)) {
      return
    }

    // Only lowercase English letters (a-z) and single spaces
    if (/[^a-z ]/.test(incoming)) {
      return
    }

    // Reject leading space
    if (incoming.startsWith(' ')) {
      return
    }

    // Reject consecutive spaces
    if (incoming.includes('  ')) {
      return
    }

    // Prevent an eighth word
    const words = incoming.split(' ')
    if (words.length > 7) {
      return
    }

    setSevenWordCode(incoming)
  }

  // Core client-side decryption executor
  const executePackageDecryption = async (
    transferId: string,
    downloadUrl: string,
  ) => {
    setActiveTransferId(transferId)
    setIsSubmitting(true)
    setErrorMessage(null)
    setDecryptStage('Retrieving encrypted package...')

    try {
      // Step 2: Retrieve the encrypted package into browser memory
      const response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error('Unable to retrieve the encrypted file package from storage.')
      }
      const encraPackageText = await response.text()

      // Step 3: Decrypt client-side using password
      setDecryptStage('Deriving key (600,000 rounds) & decrypting...')
      const result = await decryptEncraPackage(encraPackageText, password)

      // Step 4: Successful decryption triggers immediate consumption & cloud cleanup
      void consumeTransfer(transferId).catch((cleanupErr) => {
        console.warn('[decrypt] Background transfer consumption notice:', cleanupErr)
      })

      setDecryptedResult(result)
      setPendingLocationTransfer(null)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to decrypt this file. Check your credentials or verify that the encrypted package is intact.'
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
      setDecryptStage(null)
    }
  }

  // Full Decryption Flow:
  // 1. Validate credentials locally
  // 2. Submit phrase to /api/transfers/lookup
  // 3. If location required, prompt for one-time location verification
  // 4. Otherwise, fetch encrypted .encra package from S3 and decrypt
  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isReadyToDecrypt || isSubmitting) return

    setErrorMessage(null)
    setLocationError(null)
    setDecryptedResult(null)
    setIsSubmitting(true)
    setDecryptStage('Locating transfer with secret code...')

    try {
      // Step 1: Lookup transfer by 7-word phrase
      const transferMetadata = await lookupTransfer(sevenWordCode)
      setCameraCheckRequired(Boolean(transferMetadata.cameraCheckRequired))

      // If OTP verification is required, pause and show OTP panel
      if (transferMetadata.otpRequired && otpVerifiedTransferId !== transferMetadata.transferId) {
        setPendingOtpTransfer(transferMetadata)
        setIsSubmitting(false)
        setDecryptStage(null)
        return
      }

      // If location access is required (after OTP if both enabled), pause for receiver location verification
      if (transferMetadata.locationRequired && verifiedTransferId !== transferMetadata.transferId) {
        setPendingLocationTransfer(transferMetadata)
        setIsSubmitting(false)
        setDecryptStage(null)
        return
      }

      const downloadUrl = transferMetadata.locationRequired
        ? authorizedDownloadUrl
        : transferMetadata.downloadUrl

      if (!downloadUrl) {
        throw new Error('Transfer authorization failed: download URL was not provided.')
      }

      await executePackageDecryption(transferMetadata.transferId, downloadUrl)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to locate transfer. Check your 7-word secret code.'
      setErrorMessage(msg)
      setIsSubmitting(false)
      setDecryptStage(null)
    }
  }

  // OTP Verification Completed Handler
  const handleOtpVerified = async (result: {
    otpAuthToken?: string
    downloadUrl?: string
    locationRequired: boolean
  }) => {
    if (!pendingOtpTransfer) return

    const transfer = pendingOtpTransfer
    setOtpVerifiedTransferId(transfer.transferId)
    setPendingOtpTransfer(null)

    // If location is also required after OTP, show location gate next
    if (result.locationRequired) {
      setPendingLocationTransfer(transfer)
      return
    }

    // No location required — if downloadUrl was returned, proceed to decrypt
    if (result.downloadUrl) {
      await executePackageDecryption(transfer.transferId, result.downloadUrl)
      return
    }

    // Fallback: re-trigger full flow which will skip OTP since it's verified
    setErrorMessage('Authorization succeeded but no download URL was received. Please try again.')
  }

  // OTP Verification Cancel Handler
  const handleOtpCancel = () => {
    setPendingOtpTransfer(null)
    setOtpVerifiedTransferId(null)
    setActiveTransferId(null)
    setLocationDetails(null)
  }

  // Receiver Location Verification (Executed strictly once before releasing ciphertext)
  const handleVerifyLocation = () => {
    if (!pendingLocationTransfer) return
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('Browser geolocation is not supported on this device.')
      return
    }

    setIsVerifyingLocation(true)
    setLocationError(null)

    const currentTransfer = pendingLocationTransfer
    const targetTransferId = currentTransfer.transferId

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await verifyReceiverLocation({
            transferId: targetTransferId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })

          setVerifiedTransferId(targetTransferId)
          setAuthorizedDownloadUrl(res.downloadUrl)
          setLocationDetails({
            receiverCoordinates: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
            verificationResult: 'passed',
          })
          setIsVerifyingLocation(false)

          // Decrypt file immediately upon authorized location verification
          await executePackageDecryption(targetTransferId, res.downloadUrl)
        } catch (err: unknown) {
          setIsVerifyingLocation(false)
          setVerifiedTransferId(null)
          setAuthorizedDownloadUrl(null)
          const msg = err instanceof Error ? err.message : 'Location verification failed.'
          setLocationError(msg)
        }
      },
      (geoErr) => {
        setIsVerifyingLocation(false)
        setVerifiedTransferId(null)
        setAuthorizedDownloadUrl(null)
        let msg = 'Unable to determine your location.'
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          msg =
            'Location permission was denied. Please allow location access in your browser settings to access this transfer.'
        } else if (geoErr.code === geoErr.POSITION_UNAVAILABLE) {
          msg = 'Location information is currently unavailable. Please check your device location settings.'
        } else if (geoErr.code === geoErr.TIMEOUT) {
          msg = 'The location verification request timed out. Please try again.'
        }
        setLocationError(msg)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const handleOpenSecureViewer = () => {
    setTerminationReason(null)
    setIsSecureViewerOpen(true)
  }

  const handleSessionTerminate = (reason: string) => {
    setIsSecureViewerOpen(false)
    setDecryptedResult(null)
    setAuthorizedDownloadUrl(null)
    setVerifiedTransferId(null)
    setPendingLocationTransfer(null)
    setTerminationReason(reason)
  }

  const handleReset = () => {
    setSevenWordCode('')
    setPassword('')
    setShowPassword(false)
    setErrorMessage(null)
    setLocationError(null)
    setTerminationReason(null)
    setDecryptedResult(null)
    setPendingLocationTransfer(null)
    setVerifiedTransferId(null)
    setAuthorizedDownloadUrl(null)
    setCameraCheckRequired(false)
    setIsVerifyingLocation(false)
    setIsSecureViewerOpen(false)
    setCodeTouched(false)
    setPendingOtpTransfer(null)
    setOtpVerifiedTransferId(null)
    setActiveTransferId(null)
    setLocationDetails(null)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050913] text-[#F5F7FA]">
      <Navbar />

      {/* Ambient radial lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[450px]"
          style={{
            background: 'radial-gradient(ellipse, rgba(41, 151, 255, 0.08) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute top-[40%] right-1/4 w-[500px] h-[350px]"
          style={{
            background: 'radial-gradient(ellipse, rgba(20, 184, 166, 0.05) 0%, transparent 70%)',
            filter: 'blur(50px)',
          }}
        />
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center max-w-xl mx-auto w-full px-5 sm:px-6 pt-28 pb-20">
        {/* ── Page Heading ────────────────────────────────────────────── */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#2997FF]/10 border border-[#2997FF]/25 flex items-center justify-center text-[#2997FF] shadow-[0_0_20px_rgba(41,151,255,0.2)] mx-auto mb-4">
            <Lock className="w-6 h-6" strokeWidth={1.75} />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F7FA] mb-2">
            Decrypt{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2997FF] to-[#60A5FA]">
              Your File
            </span>
          </h1>

          <p className="text-sm text-[#8CA4C5] max-w-md mx-auto leading-relaxed">
            Enter the 7-word secret code and file password provided by the sender. Decryption executes entirely inside your browser.
          </p>
        </div>

        {/* ── Error Banner ────────────────────────────────────────────── */}
        {errorMessage && (
          <div className="w-full mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs sm:text-sm animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Decryption Failed</p>
              <p className="text-xs text-rose-300/90 mt-0.5 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* ── CONDITIONAL RENDER: TERMINATION SCREEN, LOCATION GATE, SUCCESS, OR FORM ──── */}
        {terminationReason ? (
          /* ── DEDICATED TERMINATION SCREEN ───────────────────────────── */
          <div className="w-full rounded-2xl bg-[#0A1220]/95 backdrop-blur-md border border-rose-500/40 p-6 sm:p-8 shadow-[0_0_50px_rgba(244,63,94,0.25)] text-center animate-in fade-in duration-300">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 mx-auto mb-4 flex items-center justify-center shadow-[0_0_30px_rgba(244,63,94,0.3)]">
              <ShieldAlert className="w-8 h-8" strokeWidth={1.75} />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-[#F5F7FA] mb-2">
              Viewing Session Terminated
            </h2>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-300 mb-5">
              <span>Security Policy Violation (3/3 Warnings Exceeded)</span>
            </div>

            <div className="p-4 rounded-xl bg-[#050913] border border-[#202B3D] text-left max-w-md mx-auto space-y-2 mb-6 text-xs text-[#8CA4C5]">
              <div className="flex items-start gap-2.5 text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-xs text-rose-200">Reason for Termination:</p>
                  <p className="text-xs text-rose-300/90 leading-relaxed mt-0.5">{terminationReason}</p>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-[#8CA4C5] pt-2 border-t border-[#202B3D]">
                In accordance with Encra Zero-Knowledge Security protocols, the decrypted file was permanently cleared from browser memory and active viewing was invalidated.
              </p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#111E30] hover:bg-[#162740] border border-[#202B3D] text-[#F5F7FA] text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow hover:shadow-[0_0_20px_rgba(41,151,255,0.2)]"
            >
              <RotateCcw className="w-4 h-4 text-[#2997FF]" />
              <span>Return to Decrypt Screen</span>
            </button>
          </div>
        ) : pendingOtpTransfer && !decryptedResult ? (
          /* ── OTP VERIFICATION GATE ─────────────────────────────────── */
          <OtpVerificationPanel
            transferId={pendingOtpTransfer.transferId}
            maskedEmail={pendingOtpTransfer.maskedEmail || '***@***.***'}
            onVerified={handleOtpVerified}
            onCancel={handleOtpCancel}
            verifyOtp={verifyTransferOtp}
            resendOtp={resendTransferOtp}
          />
        ) : pendingLocationTransfer && !decryptedResult ? (
          /* ── LOCATION VERIFICATION GATE ────────────────────────────── */
          <div className="w-full rounded-2xl bg-[#0A1220]/90 backdrop-blur-md border border-[#2997FF]/30 p-6 sm:p-8 shadow-[0_0_40px_rgba(41,151,255,0.1)] animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center gap-3.5 pb-5 border-b border-[#202B3D]">
              <div className="w-12 h-12 rounded-xl bg-[#2997FF]/15 border border-[#2997FF]/30 text-[#2997FF] flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(41,151,255,0.25)]">
                <MapPin className="w-6 h-6" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-[#F5F7FA]">
                  Location Verification Required
                </h2>
                <p className="text-xs text-[#8CA4C5] mt-0.5">
                  The sender has restricted access to a specific geographic boundary.
                </p>
              </div>
            </div>

            {/* Transfer Info Summary */}
            <div className="my-5 p-4 rounded-xl bg-[#050913]/90 border border-[#202B3D] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#8CA4C5]">File:</span>
                <span className="text-[#F5F7FA] font-semibold truncate ml-2">{pendingLocationTransfer.originalFileName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#8CA4C5]">Permitted Radius:</span>
                <span className="text-[#2997FF] font-medium">
                  {(pendingLocationTransfer.radiusKm || 5) >= 1
                    ? `${pendingLocationTransfer.radiusKm || 5} km`
                    : `${(pendingLocationTransfer.radiusKm || 0.5) * 1000} m`
                  }
                </span>
              </div>
            </div>

            {/* Explanation */}
            <div className="p-3.5 rounded-xl bg-[#2997FF]/5 border border-[#2997FF]/15 flex items-start gap-3 text-xs text-[#8CA4C5] mb-5">
              <Compass className="w-5 h-5 text-[#2997FF] shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <p>
                  Your browser will request permission to access your device's GPS coordinates. This check is performed <strong className="text-[#F5F7FA]">once</strong> — your location will not be tracked during viewing.
                </p>
                <p className="mt-1.5 text-[11px] text-[#8CA4C5]/70">
                  Note: Browser geolocation can be spoofed and does not guarantee physical presence.
                </p>
              </div>
            </div>

            {/* Location Verification Error */}
            {locationError && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-in fade-in duration-200">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-rose-200">Location Verification Failed</p>
                  <p className="text-xs text-rose-300/90 mt-0.5 leading-relaxed">{locationError}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={handleVerifyLocation}
                disabled={isVerifyingLocation}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white text-xs sm:text-sm font-semibold tracking-wide transition-all shadow-[0_0_24px_rgba(41,151,255,0.35)] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifyingLocation ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Location...</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-4 h-4" />
                    <span>Verify My Location</span>
                  </>
                )}
              </button>

              {locationError && (
                <button
                  type="button"
                  onClick={handleVerifyLocation}
                  disabled={isVerifyingLocation}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-[#0A1220] hover:bg-[#111E30] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Try Again</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-[#0A1220] hover:bg-[#111E30] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] text-xs sm:text-sm font-medium transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        ) : decryptedResult ? (
          /* ── DECRYPTION SUCCESS CARD ────────────────────────────────── */
          <div className="w-full rounded-2xl bg-[#0A1220]/90 backdrop-blur-md border border-teal-500/30 p-6 sm:p-8 shadow-[0_0_40px_rgba(20,184,166,0.12)] animate-in fade-in duration-300">
            <div className="flex items-center gap-3.5 pb-5 border-b border-[#202B3D]">
              <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(20,184,166,0.25)]">
                <CheckCircle2 className="w-6 h-6" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-[#F5F7FA]">
                  File Decrypted Successfully
                </h2>
                <p className="text-xs text-teal-400 font-medium mt-0.5">
                  Authenticated and deciphered in {decryptedResult.durationMs}ms
                </p>
              </div>
            </div>

            {/* Decrypted File Metadata Details */}
            <div className="my-6 p-4 rounded-xl bg-[#050913]/90 border border-[#202B3D] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#2997FF]/10 border border-[#2997FF]/25 flex items-center justify-center text-[#2997FF] shrink-0">
                    <FileCheck className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#8CA4C5] uppercase tracking-wider font-semibold">
                      Decrypted File
                    </p>
                    <p className="text-sm font-semibold text-[#F5F7FA] truncate mt-0.5">
                      {decryptedResult.filename}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/25 shrink-0">
                  {formatBytes(decryptedResult.originalSize)}
                </span>
              </div>

              <div className="pt-2 border-t border-[#202B3D]/60 flex items-center justify-between text-xs text-[#8CA4C5]">
                <span>Type: {decryptedResult.mimeType}</span>
                <div className="flex items-center gap-3">
                  {cameraCheckRequired && (
                    <span className="text-[#2997FF] font-medium flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" /> Camera Check Enforced
                    </span>
                  )}
                  <span className="text-teal-400 font-medium">✓ AES-GCM Integrity Verified</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleOpenSecureViewer}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white text-xs sm:text-sm font-semibold tracking-wide transition-all shadow-[0_0_24px_rgba(41,151,255,0.35)] active:scale-[0.98] cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Open Secure Viewer</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-[#0A1220] hover:bg-[#111E30] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] text-xs sm:text-sm font-medium transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Decrypt Another</span>
              </button>
            </div>
          </div>
        ) : (
          /* ── MAIN DECRYPTION INPUT FORM ─────────────────────────────── */
          <div className="w-full rounded-2xl bg-[#0A1220]/80 backdrop-blur-sm border border-[#202B3D] p-6 sm:p-8 shadow-[0_0_30px_rgba(41,151,255,0.06)]">
            <form onSubmit={handleDecrypt} className="space-y-5">
              {/* Field 1: Seven-Word Secret Code */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label
                    htmlFor="decrypt-seven-word-code"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#8CA4C5]"
                  >
                    Seven-Word Secret Code
                  </label>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${isCodeValid
                      ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                      : 'bg-[#050913] text-[#8CA4C5] border-[#202B3D]'
                      }`}
                  >
                    {wordCount}/7 words
                  </span>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8CA4C5]">
                    <KeyRound className="w-4 h-4" strokeWidth={1.75} />
                  </div>
                  <input
                    id="decrypt-seven-word-code"
                    type="text"
                    required
                    autoComplete="off"
                    spellCheck={false}
                    value={sevenWordCode}
                    onChange={handleCodeChange}
                    onBlur={() => setCodeTouched(true)}
                    placeholder="e.g. winter orange velvet harbor canyon silver whisper"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#050913] border text-[#F5F7FA] placeholder-[#8CA4C5]/40 text-xs sm:text-sm font-mono tracking-wide focus:outline-none transition-all ${isCodeValid
                      ? 'border-teal-500/60 focus:border-teal-400 focus:ring-1 focus:ring-teal-400'
                      : codeTouched && sevenWordCode && !isCodeValid
                        ? 'border-amber-500/60 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'
                        : 'border-[#202B3D] focus:border-[#2997FF] focus:ring-1 focus:ring-[#2997FF]'
                      }`}
                  />
                </div>

                {/* Validation Feedback */}
                <div className="mt-2 text-[11px] text-[#8CA4C5]">
                  {isCodeValid ? (
                    <span className="text-teal-400 flex items-center gap-1 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Valid 7-word secret code format.
                    </span>
                  ) : codeTouched && sevenWordCode ? (
                    <span className="text-amber-400/90 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {wordCount < 7
                        ? `${7 - wordCount} more lowercase word${7 - wordCount > 1 ? 's' : ''} needed.`
                        : 'Code must be exactly 7 lowercase words separated by single spaces.'}
                    </span>
                  ) : (
                    <span>Enter exactly 7 lowercase words separated by single spaces.</span>
                  )}
                </div>
              </div>

              {/* Field 2: File Password */}
              <div>
                <label
                  htmlFor="decrypt-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#8CA4C5] mb-2"
                >
                  File Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8CA4C5]">
                    <Lock className="w-4 h-4" strokeWidth={1.75} />
                  </div>
                  <input
                    id="decrypt-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter file decryption password..."
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#050913] border border-[#202B3D] text-[#F5F7FA] placeholder-[#8CA4C5]/50 text-sm focus:outline-none focus:border-[#2997FF] focus:ring-1 focus:ring-[#2997FF] transition-all"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Decrypt Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!isReadyToDecrypt || isSubmitting}
                  className={`w-full group inline-flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl text-sm font-semibold tracking-wide transition-all duration-300 ${isReadyToDecrypt && !isSubmitting
                    ? 'bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white shadow-[0_0_24px_rgba(41,151,255,0.35)] active:scale-[0.99] cursor-pointer'
                    : 'bg-[#202B3D]/70 text-[#8CA4C5]/60 cursor-not-allowed border border-[#202B3D]'
                    }`}
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{decryptStage || 'Decrypting File...'}</span>
                    </>
                  ) : (
                    <>
                      <span>Decrypt & Access File</span>
                      <span className="transition-transform duration-200 group-hover:translate-x-1">
                        →
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Footer Security Statement ───────────────────────────────── */}
        <div className="mt-6 text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs text-[#8CA4C5]">
            <ShieldCheck className="w-4 h-4 text-[#2997FF]" strokeWidth={1.75} />
            <span>Zero-Knowledge Decryption: Password never leaves your browser.</span>
          </div>
          <p className="text-[11px] text-[#8CA4C5]/75">
            Encra computes the lookup fingerprint with server-side HMAC-SHA-256.
          </p>
        </div>
      </main>

      {/* ── Secure File Viewer (Protected Preview with Tab & Window Monitoring) ── */}
      {isSecureViewerOpen && decryptedResult && (
        <SecureFileViewer
          blob={decryptedResult.decryptedBlob}
          filename={decryptedResult.filename}
          mimeType={decryptedResult.mimeType}
          fileSize={decryptedResult.originalSize}
          cameraCheckRequired={cameraCheckRequired}
          transferId={activeTransferId || undefined}
          authResults={{
            secretCode: true,
            password: true,
            recipientOtp: Boolean(otpVerifiedTransferId),
            locationCheck: Boolean(verifiedTransferId),
            cameraCheck: Boolean(cameraCheckRequired),
          }}
          locationInfo={locationDetails}
          onClose={() => setIsSecureViewerOpen(false)}
          onTerminate={handleSessionTerminate}
        />
      )}

      <Footer />
    </div>
  )
}
