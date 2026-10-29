import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Lock, CheckCircle2, X } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import FileUploadZone from '@/components/encrypt/FileUploadZone'
import PasswordSetupPanel from '@/components/encrypt/PasswordSetupPanel'
import { evaluatePassword } from '@/components/encrypt/passwordUtils'
import SecurityControlsPanel, { SecurityControlsState } from '@/components/encrypt/SecurityControlsPanel'

export default function EncryptPage() {
  const navigate = useNavigate()

  // State management
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [securityControls, setSecurityControls] = useState<SecurityControlsState>({
    accessLevel: 'standard',
    verificationMethod: 'email',
    verifiedEmail: '',
    verifiedPhone: '',
    expiryEnabled: true,
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

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  // Validation
  const passwordEvaluation = useMemo(() => evaluatePassword(password), [password])
  const isPasswordValid = password.length >= 8 && password === confirmPassword

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
    return Boolean(file) && isPasswordValid && !fileError && isVerifiedValid
  }, [file, isPasswordValid, fileError, isVerifiedValid])

  const handleEncrypt = () => {
    if (!isReadyToEncrypt) return

    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      setShowSuccessModal(true)
    }, 1200)
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
          {/* Back button */}
          <Link
            to="/"
            className="group inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-[#0A1220] border border-[#202B3D] group-hover:border-[#2997FF]/40 flex items-center justify-center text-[#8CA4C5] group-hover:text-[#F5F7FA] transition-colors">
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            </div>
            <span>Back</span>
          </Link>

          {/* Privacy badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0A1220]/90 border border-[#202B3D] text-[11px] sm:text-xs text-[#8CA4C5]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2997FF]" strokeWidth={2} />
            <span>Your files stay private</span>
          </div>
        </div>

        {/* ── Large Heading Row ────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-3">
            {/* Small lock icon inside rounded square with glow */}
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#2997FF]/10 border border-[#2997FF]/25 flex items-center justify-center text-[#2997FF] shadow-[0_0_20px_rgba(41,151,255,0.2)] shrink-0">
              <Lock className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.75} />
            </div>

            {/* Thin vertical divider */}
            <div className="w-px h-8 sm:h-9 bg-[#202B3D] shrink-0" aria-hidden="true" />

            {/* Page Heading */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#F5F7FA]">
              Encrypt{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2997FF] to-[#60A5FA]">
                Your File
              </span>
            </h1>
          </div>

          {/* Supporting text */}
          <p className="text-sm sm:text-[15px] text-[#A1ADBF] max-w-xl">
            Add a password and configure security rules to keep your file truly private.
          </p>
        </div>

        {/* ── 1. File Upload Area ─────────────────────────────────────── */}
        <section aria-label="Upload File" className="mb-8">
          <FileUploadZone
            file={file}
            onFileSelect={setFile}
            error={fileError}
            onError={setFileError}
          />
        </section>

        {/* ── 2. Password Setup Panel ─────────────────────────────────── */}
        <section aria-label="Set Password" className="mb-8">
          <PasswordSetupPanel
            password={password}
            confirmPassword={confirmPassword}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
          />
        </section>

        {/* ── 3. Additional Security Controls & Bottom Action Bar ────── */}
        <section aria-label="Additional Security Controls">
          <SecurityControlsPanel
            controls={securityControls}
            onChange={setSecurityControls}
            isReadyToEncrypt={isReadyToEncrypt}
            isSubmitting={isSubmitting}
            onSubmit={handleEncrypt}
          />
        </section>
      </main>

      {/* ── Validation Success Modal ──────────────────────────────────── */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0A1220] border border-[#202B3D] p-6 sm:p-8 shadow-[0_0_50px_rgba(41,151,255,0.2)]">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-5 right-5 p-1 rounded-lg text-[#8CA4C5] hover:text-[#F5F7FA] hover:bg-[#111E30] transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6" strokeWidth={2} />
            </div>

            {/* Content */}
            <h2 id="modal-title" className="text-xl font-bold text-[#F5F7FA] mb-2">
              Ready for Client-Side Encryption
            </h2>
            <p className="text-sm text-[#A1ADBF] leading-relaxed mb-6">
              All frontend validation parameters have been satisfied. File{' '}
              <span className="text-[#F5F7FA] font-medium">"{file?.name}"</span> is configured with AES-256-GCM encryption parameters and active security boundaries.
            </p>

            {/* Summary details */}
            <div className="rounded-xl bg-[#050913] border border-[#202B3D] p-4 text-xs space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-[#8CA4C5]">Access Level:</span>
                <span className="font-semibold text-[#2997FF]">
                  {securityControls.accessLevel === 'standard'
                    ? 'Standard (Password Only)'
                    : `Verified (${securityControls.verificationMethod === 'email' ? 'Email OTP' : 'SMS OTP'} to ${
                        securityControls.verificationMethod === 'email'
                          ? securityControls.verifiedEmail
                          : securityControls.verifiedPhone
                      })`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8CA4C5]">Password Strength:</span>
                <span className="font-semibold text-emerald-400 uppercase">
                  {passwordEvaluation.strength}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8CA4C5]">Decryption Expiry:</span>
                <span className="font-semibold text-[#F5F7FA]">
                  {securityControls.expiryEnabled ? '24h Expiry Window Active' : 'No Expiry'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8CA4C5]">Location Restriction:</span>
                <span className="font-semibold text-[#F5F7FA]">
                  {securityControls.locationEnabled ? `${securityControls.radiusKm} km Radius` : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8CA4C5]">Camera Check:</span>
                <span className="font-semibold text-[#F5F7FA]">
                  {securityControls.cameraCheckEnabled ? 'Explicit Consent Required' : 'Disabled'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="px-5 py-2.5 rounded-xl bg-[#111E30] text-[#F5F7FA] hover:bg-[#162740] border border-[#202B3D] text-xs font-semibold transition-colors"
              >
                Close & Review
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white text-xs font-semibold transition-all shadow-[0_0_15px_rgba(41,151,255,0.25)]"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
