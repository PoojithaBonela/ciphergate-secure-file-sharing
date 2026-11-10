import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mail,
  ShieldCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
  Clock,
  KeyRound,
} from 'lucide-react'

export interface OtpVerificationPanelProps {
  transferId: string
  maskedEmail: string
  onVerified: (result: { otpAuthToken?: string; downloadUrl?: string; locationRequired: boolean }) => void
  onCancel: () => void
  verifyOtp: (transferId: string, otp: string) => Promise<{
    status: string
    verified: boolean
    locationRequired: boolean
    otpAuthToken?: string
    downloadUrl?: string
    message: string
  }>
  resendOtp: (transferId: string) => Promise<{ status: string; message: string }>
}

export default function OtpVerificationPanel({
  transferId,
  maskedEmail,
  onVerified,
  onCancel,
  verifyOtp,
  resendOtp,
}: OtpVerificationPanelProps) {
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(60)
  const [canResend, setCanResend] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown timer (60 seconds)
  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true)
      return
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCanResend(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdown])

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      // Only allow single digit
      const digit = value.replace(/\D/g, '').slice(-1)
      const newDigits = [...otpDigits]
      newDigits[index] = digit
      setOtpDigits(newDigits)
      setError(null)
      setResendMessage(null)

      // Auto-advance to next input
      if (digit && index < 5) {
        inputRefs.current[index + 1]?.focus()
      }
    },
    [otpDigits],
  )

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        if (!otpDigits[index] && index > 0) {
          // Move back to previous input on backspace of empty field
          const newDigits = [...otpDigits]
          newDigits[index - 1] = ''
          setOtpDigits(newDigits)
          inputRefs.current[index - 1]?.focus()
          e.preventDefault()
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        inputRefs.current[index - 1]?.focus()
        e.preventDefault()
      } else if (e.key === 'ArrowRight' && index < 5) {
        inputRefs.current[index + 1]?.focus()
        e.preventDefault()
      }
    },
    [otpDigits],
  )

  // Handle paste of full 6-digit code
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
      if (pasted.length === 0) return

      const newDigits = [...otpDigits]
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || ''
      }
      setOtpDigits(newDigits)
      setError(null)

      // Focus last filled input or the next empty one
      const focusIndex = Math.min(pasted.length, 5)
      inputRefs.current[focusIndex]?.focus()
    },
    [otpDigits],
  )

  const fullOtp = otpDigits.join('')
  const isOtpComplete = fullOtp.length === 6 && /^\d{6}$/.test(fullOtp)

  const handleVerify = async () => {
    if (!isOtpComplete || isVerifying) return

    setIsVerifying(true)
    setError(null)
    setResendMessage(null)

    try {
      const result = await verifyOtp(transferId, fullOtp)
      onVerified({
        otpAuthToken: result.otpAuthToken,
        downloadUrl: result.downloadUrl,
        locationRequired: result.locationRequired,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OTP verification failed.'
      setError(msg)
      // Clear inputs on failure
      setOtpDigits(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    if (!canResend || isResending) return

    setIsResending(true)
    setError(null)
    setResendMessage(null)

    try {
      const result = await resendOtp(transferId)
      setResendMessage(result.message || 'A new verification code has been sent.')
      setOtpDigits(['', '', '', '', '', ''])
      setCountdown(60)
      setCanResend(false)
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend verification code.'
      setError(msg)
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="w-full rounded-2xl bg-[#0A1220]/90 backdrop-blur-md border border-[#2997FF]/30 p-6 sm:p-8 shadow-[0_0_40px_rgba(41,151,255,0.1)] animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3.5 pb-5 border-b border-[#202B3D]">
        <div className="w-12 h-12 rounded-xl bg-[#2997FF]/15 border border-[#2997FF]/30 text-[#2997FF] flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(41,151,255,0.25)]">
          <Mail className="w-6 h-6" strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-[#F5F7FA]">
            Email Verification Required
          </h2>
          <p className="text-xs text-[#8CA4C5] mt-0.5">
            A 6-digit verification code has been sent to the recipient's email.
          </p>
        </div>
      </div>

      {/* Masked Email Display */}
      <div className="mt-5 p-4 rounded-xl bg-[#050913]/90 border border-[#202B3D] flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#2997FF]/10 border border-[#2997FF]/25 flex items-center justify-center text-[#2997FF] shrink-0">
          <KeyRound className="w-4.5 h-4.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[#8CA4C5]">Verification code sent to:</p>
          <p className="text-sm font-semibold text-[#F5F7FA] font-mono tracking-wide">
            {maskedEmail}
          </p>
        </div>
      </div>

      {/* OTP Input Grid */}
      <div className="mt-6 mb-4">
        <label className="block text-xs font-semibold text-[#8CA4C5] mb-3 text-center">
          Enter the 6-digit verification code
        </label>

        <div className="flex items-center justify-center gap-2 sm:gap-3">
          {otpDigits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              autoComplete="one-time-code"
              className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold font-mono rounded-xl border-2 bg-[#050913] text-[#F5F7FA] focus:outline-none transition-all duration-200 ${
                digit
                  ? 'border-[#2997FF] shadow-[0_0_12px_rgba(41,151,255,0.3)]'
                  : 'border-[#202B3D] focus:border-[#2997FF] focus:shadow-[0_0_12px_rgba(41,151,255,0.2)]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Countdown Timer */}
      <div className="flex items-center justify-center gap-2 text-xs mb-5">
        <Clock className="w-3.5 h-3.5 text-[#8CA4C5]" />
        {countdown > 0 ? (
          <span className="text-[#8CA4C5]">
            Code expires in{' '}
            <span className={`font-semibold ${countdown <= 10 ? 'text-amber-400' : 'text-[#2997FF]'}`}>
              {countdown}s
            </span>
          </span>
        ) : (
          <span className="text-amber-400 font-medium">
            Verification code has expired.
          </span>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-200">Verification Failed</p>
            <p className="text-xs text-rose-300/90 mt-0.5 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Resend Success Message */}
      {resendMessage && (
        <div className="mb-4 p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center gap-2.5 text-xs text-teal-300 animate-in fade-in duration-200">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{resendMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleVerify}
          disabled={!isOtpComplete || isVerifying}
          className={`w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wide transition-all ${
            isOtpComplete && !isVerifying
              ? 'bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white shadow-[0_0_24px_rgba(41,151,255,0.35)] active:scale-[0.98] cursor-pointer'
              : 'bg-[#202B3D]/70 text-[#8CA4C5]/60 cursor-not-allowed border border-[#202B3D]'
          }`}
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Verify Code</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={!canResend || isResending}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
            canResend && !isResending
              ? 'bg-[#0A1220] hover:bg-[#111E30] border border-[#2997FF]/30 text-[#2997FF] hover:text-[#38A0FF] cursor-pointer'
              : 'bg-[#0A1220] border border-[#202B3D] text-[#8CA4C5]/50 cursor-not-allowed'
          }`}
        >
          {isResending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{canResend ? 'Resend Code' : `Resend in ${countdown}s`}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-[#0A1220] hover:bg-[#111E30] border border-[#202B3D] text-[#8CA4C5] hover:text-[#F5F7FA] text-xs sm:text-sm font-medium transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {/* Security Note */}
      <div className="mt-5 pt-4 border-t border-[#202B3D]/60 text-center">
        <p className="text-[11px] text-[#8CA4C5]/70">
          This code is valid for 60 seconds. Do not share it with anyone. The sender's email address is never revealed.
        </p>
      </div>
    </div>
  )
}

