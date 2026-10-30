import { useState, useMemo, useEffect } from 'react'
import {
  ShieldCheck,
  Clock3,
  MapPin,
  Camera,
  BellRing,
  ChevronDown,
  ChevronUp,
  Lock,
  Info,
  Mail,
  MessageSquare,
  Search,
  Smartphone,
  AlertCircle,
} from 'lucide-react'

export interface SecurityControlsState {
  accessLevel: 'standard' | 'verified'
  sevenWordCode: string
  verificationMethod: 'email' | 'phone'
  verifiedEmail: string
  verifiedPhone: string
  expiryEnabled: boolean
  expiryDate: string // ISO string or datetime-local
  locationEnabled: boolean
  locationQuery: string
  radiusKm: number
  cameraCheckEnabled: boolean
  cameraConsentChecked: boolean
  notificationsEnabled: boolean
  notificationType: 'email' | 'whatsapp'
  notificationTarget: string
}

export interface SecurityControlsPanelProps {
  controls: SecurityControlsState
  onChange: (updater: (prev: SecurityControlsState) => SecurityControlsState) => void
  isSubmitting?: boolean
  onSubmit: () => void
  isReadyToEncrypt: boolean
}

// Format local Date to 'YYYY-MM-DDTHH:mm' for datetime-local input
function toLocalDateTimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SecurityControlsPanel({
  controls,
  onChange,
  isSubmitting = false,
  onSubmit,
  isReadyToEncrypt,
}: SecurityControlsPanelProps) {
  // Expandable row details
  const [expandedRow, setExpandedRow] = useState<'expiry' | 'location' | 'camera' | 'notifications' | null>(null)
  const [showAesTooltip, setShowAesTooltip] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [secretCodeTouched, setSecretCodeTouched] = useState(false)

  // 7-Word Secret Code validation
  const secretCodeWordCount = useMemo(() => {
    if (!controls.sevenWordCode.trim()) return 0
    return controls.sevenWordCode.trim().split(/\s+/).filter(Boolean).length
  }, [controls.sevenWordCode])

  const isSevenWordCodeValid = useMemo(() => {
    return /^[a-z]+( [a-z]+){6}$/.test(controls.sevenWordCode)
  }, [controls.sevenWordCode])

  const handleSecretCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = e.target.value

    // Allow clearing
    if (incoming === '') {
      onChange((prev) => ({ ...prev, sevenWordCode: '' }))
      return
    }

    // Reject uppercase letters (do NOT silently convert to lowercase)
    if (/[A-Z]/.test(incoming)) {
      return
    }

    // Only lowercase english letters a-z and single space allowed
    if (/[^a-z ]/.test(incoming)) {
      return
    }

    // Reject leading spaces
    if (incoming.startsWith(' ')) {
      return
    }

    // Reject consecutive spaces
    if (incoming.includes('  ')) {
      return
    }

    // Prevent an eighth word: if already 7 words and space is entered
    const words = incoming.split(' ')
    if (words.length > 7) {
      return
    }

    onChange((prev) => ({ ...prev, sevenWordCode: incoming }))
  }

  // Current time window for expiry
  const now = useMemo(() => new Date(), [])
  const maxExpiry = useMemo(() => new Date(now.getTime() + 24 * 60 * 60 * 1000), [now])

  const minTimeString = toLocalDateTimeString(now)
  const maxTimeString = toLocalDateTimeString(maxExpiry)

  // Calculate remaining time
  const remainingTimeText = useMemo(() => {
    if (!controls.expiryEnabled || !controls.expiryDate) return ''
    const target = new Date(controls.expiryDate).getTime()
    const diffMs = target - Date.now()

    if (diffMs <= 0) return 'Expired or invalid time'
    const totalMinutes = Math.floor(diffMs / (1000 * 60))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) return `Expires in: ${minutes} minute${minutes !== 1 ? 's' : ''}`
    return `Expires in: ${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`
  }, [controls.expiryEnabled, controls.expiryDate])

  // Email & Phone validation
  const isEmailValid = useMemo(() => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(controls.verifiedEmail.trim())
  }, [controls.verifiedEmail])

  const isPhoneValid = useMemo(() => {
    const clean = controls.verifiedPhone.trim()
    const digits = clean.replace(/\D/g, '')
    return digits.length >= 7 && /^\+?[0-9\s\-()]+$/.test(clean)
  }, [controls.verifiedPhone])

  // Helper toggle
  const toggleRow = (row: 'expiry' | 'location' | 'camera' | 'notifications') => {
    setExpandedRow((curr) => (curr === row ? null : row))
  }

  // Set quick expiry presets
  const setQuickExpiry = (hours: number) => {
    const futureDate = new Date(Date.now() + hours * 60 * 60 * 1000)
    onChange((prev) => ({
      ...prev,
      expiryDate: toLocalDateTimeString(futureDate),
    }))
  }

  // Ensure default expiry is set if empty
  useEffect(() => {
    if (!controls.expiryDate) {
      const default24h = new Date(Date.now() + 24 * 60 * 60 * 1000)
      onChange((prev) => ({
        ...prev,
        expiryDate: toLocalDateTimeString(default24h),
      }))
    }
  }, [controls.expiryDate, onChange])

  return (
    <div className="w-full rounded-2xl bg-[#0A1220]/80 backdrop-blur-sm border border-[#202B3D] p-6 sm:p-8 mt-8">
      {/* ── Section Title ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#202B3D]/70">
        <div className="w-9 h-9 rounded-xl bg-[#2997FF]/10 border border-[#2997FF]/25 flex items-center justify-center text-[#2997FF]">
          <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#F5F7FA]">
            Additional Security Controls
          </h3>
          <p className="text-xs sm:text-sm text-[#8CA4C5]">
            Configure optional access rules, time boundaries, and audit preferences.
          </p>
        </div>
      </div>

      {/* ── Settings Rows ────────────────────────────────────────────── */}
      <div className="divide-y divide-[#202B3D]/60 space-y-5">
        {/* ── CONTROL 1: Access Level ─────────────────────────────────── */}
        <div className="pt-2 first:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3.5 sm:gap-4">
              <div className="w-9 h-9 rounded-full bg-[#2997FF]/15 text-[#2997FF] border border-[#2997FF]/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm sm:text-[15px] font-semibold text-[#F5F7FA]">
                  Access Level
                </p>
                <p className="text-xs text-[#8CA4C5]">
                  Choose how recipients verify their access before decrypting.
                </p>
              </div>
            </div>

            {/* Status Indicator */}
            <div className="pl-12 sm:pl-0">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#2997FF]/10 text-[#2997FF] border border-[#2997FF]/25">
                {controls.accessLevel === 'standard' ? 'Password + 7-Word Code' : 'Password + 7-Word Code + OTP'}
              </span>
            </div>
          </div>

          {/* Option Cards: Standard vs Verified */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
            {/* Option 1: Standard */}
            <div
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  accessLevel: 'standard',
                }))
              }
              role="radio"
              aria-checked={controls.accessLevel === 'standard'}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  onChange((prev) => ({ ...prev, accessLevel: 'standard' }))
                }
              }}
              className={`cursor-pointer rounded-xl p-4 border transition-all duration-200 flex items-start gap-3.5 ${
                controls.accessLevel === 'standard'
                  ? 'border-[#2997FF] bg-[#2997FF]/10 shadow-[0_0_20px_rgba(41,151,255,0.18)]'
                  : 'border-[#202B3D] bg-[#050913]/70 hover:border-[#202B3D]/80 hover:bg-[#0A1220]'
              }`}
            >
              {/* Radio Circle */}
              <div
                className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 transition-colors ${
                  controls.accessLevel === 'standard'
                    ? 'border-[#2997FF] bg-[#2997FF]'
                    : 'border-[#8CA4C5]/60 bg-transparent'
                }`}
              >
                {controls.accessLevel === 'standard' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-[#F5F7FA]">Standard</p>
                <p className="text-xs text-[#8CA4C5] mt-0.5">
                  Password + 7-word secret code
                </p>
              </div>
            </div>

            {/* Option 2: Verified */}
            <div
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  accessLevel: 'verified',
                }))
              }
              role="radio"
              aria-checked={controls.accessLevel === 'verified'}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  onChange((prev) => ({ ...prev, accessLevel: 'verified' }))
                }
              }}
              className={`cursor-pointer rounded-xl p-4 border transition-all duration-200 flex items-start gap-3.5 ${
                controls.accessLevel === 'verified'
                  ? 'border-[#2997FF] bg-[#2997FF]/10 shadow-[0_0_20px_rgba(41,151,255,0.18)]'
                  : 'border-[#202B3D] bg-[#050913]/70 hover:border-[#202B3D]/80 hover:bg-[#0A1220]'
              }`}
            >
              {/* Radio Circle */}
              <div
                className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 transition-colors ${
                  controls.accessLevel === 'verified'
                    ? 'border-[#2997FF] bg-[#2997FF]'
                    : 'border-[#8CA4C5]/60 bg-transparent'
                }`}
              >
                {controls.accessLevel === 'verified' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-[#F5F7FA]">Verified</p>
                <p className="text-xs text-[#8CA4C5] mt-0.5">
                  Password + 7-word secret code + OTP
                </p>
              </div>
            </div>
          </div>

          {/* ── Seven-Word Secret Code Input Section (Required for both Standard & Verified) ── */}
          <div className="mt-4 p-4 sm:p-5 rounded-xl bg-[#050913]/90 border border-[#202B3D] space-y-4 animate-in fade-in duration-200">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="encra-seven-word-code"
                  className="block text-xs font-semibold text-[#F5F7FA]"
                >
                  Seven-Word Secret Code <span className="text-[#2997FF]">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                      isSevenWordCodeValid
                        ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                        : 'bg-[#0A1220] text-[#8CA4C5] border-[#202B3D]'
                    }`}
                  >
                    {secretCodeWordCount}/7 words
                  </span>
                </div>
              </div>

              <p className="text-xs text-[#8CA4C5] mb-2 leading-relaxed">
                The recipient uses this phrase to find and download the transfer. The server stores only an HMAC-SHA-256 fingerprint, never the plaintext phrase.
              </p>

              <div className="relative">
                <input
                  id="encra-seven-word-code"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={controls.sevenWordCode}
                  onChange={handleSecretCodeChange}
                  onBlur={() => setSecretCodeTouched(true)}
                  placeholder="e.g. winter orange velvet harbor canyon silver whisper"
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-[#0A1220] border text-[#F5F7FA] placeholder-[#8CA4C5]/40 text-xs sm:text-sm font-mono tracking-wide focus:outline-none transition-colors ${
                    isSevenWordCodeValid
                      ? 'border-teal-500/60 focus:border-teal-400'
                      : secretCodeTouched && controls.sevenWordCode && !isSevenWordCodeValid
                        ? 'border-amber-500/60 focus:border-amber-400'
                        : 'border-[#202B3D] focus:border-[#2997FF]'
                  }`}
                />
              </div>

              {/* Validation Status Message */}
              <div className="mt-2 text-[11px] flex items-center gap-1.5">
                {isSevenWordCodeValid ? (
                  <span className="text-teal-400 flex items-center gap-1 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    Valid 7-word secret code ready for registration.
                  </span>
                ) : secretCodeWordCount === 0 ? (
                  <span className="text-[#8CA4C5]">
                    Enter exactly 7 lowercase English words (a-z) separated by single spaces.
                  </span>
                ) : secretCodeWordCount < 7 ? (
                  <span className="text-amber-400/90 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {7 - secretCodeWordCount} more word{7 - secretCodeWordCount > 1 ? 's' : ''} needed to reach exactly 7 words.
                  </span>
                ) : controls.sevenWordCode.endsWith(' ') ? (
                  <span className="text-amber-400/90 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Remove trailing space at the end of the phrase.
                  </span>
                ) : (
                  <span className="text-amber-400/90 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Ensure words contain only lowercase letters (a-z) without symbols or numbers.
                  </span>
                )}
              </div>
            </div>

            {/* Verified OTP Configuration Drawer (Shown only when Verified access is chosen) */}
            {controls.accessLevel === 'verified' && (
              <div className="pt-4 border-t border-[#202B3D]/70 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#8CA4C5] mb-2.5">
                    Send OTP verification code via:
                  </p>

                  {/* Compact Segmented Control */}
                  <div className="inline-flex p-1 rounded-xl bg-[#0A1220] border border-[#202B3D]">
                    <button
                      type="button"
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          verificationMethod: 'email',
                        }))
                      }
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        controls.verificationMethod === 'email'
                          ? 'bg-[#2997FF] text-white shadow-sm font-semibold'
                          : 'text-[#A1ADBF] hover:text-[#F5F7FA]'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          verificationMethod: 'phone',
                        }))
                      }
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        controls.verificationMethod === 'phone'
                          ? 'bg-[#2997FF] text-white shadow-sm font-semibold'
                          : 'text-[#A1ADBF] hover:text-[#F5F7FA]'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Phone / SMS</span>
                    </button>
                  </div>
                </div>

                {/* Dynamic Field */}
                <div>
                  <label
                    htmlFor="encra-verification-target"
                    className="block text-xs font-semibold text-[#8CA4C5] mb-1.5"
                  >
                    {controls.verificationMethod === 'email'
                      ? "Recipient's email address *"
                      : "Recipient's phone number *"}
                  </label>

                  {controls.verificationMethod === 'email' ? (
                    <div>
                      <input
                        id="encra-verification-target"
                        type="email"
                        required
                        value={controls.verifiedEmail}
                        onChange={(e) => {
                          const val = e.target.value
                          onChange((prev) => ({ ...prev, verifiedEmail: val }))
                        }}
                        onBlur={() => setEmailTouched(true)}
                        placeholder="recipient@example.com"
                        className={`w-full px-3.5 py-2 rounded-lg bg-[#0A1220] border text-[#F5F7FA] placeholder-[#8CA4C5]/50 text-xs focus:outline-none transition-colors ${
                          emailTouched && controls.verifiedEmail && !isEmailValid
                            ? 'border-rose-500/80 focus:border-rose-500'
                            : 'border-[#202B3D] focus:border-[#2997FF]'
                        }`}
                      />
                      {emailTouched && controls.verifiedEmail && !isEmailValid && (
                        <p className="mt-1.5 text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          Please enter a valid email address (e.g. name@domain.com).
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        id="encra-verification-target"
                        type="tel"
                        required
                        value={controls.verifiedPhone}
                        onChange={(e) => {
                          const val = e.target.value
                          onChange((prev) => ({ ...prev, verifiedPhone: val }))
                        }}
                        onBlur={() => setPhoneTouched(true)}
                        placeholder="+91 98765 43210"
                        className={`w-full px-3.5 py-2 rounded-lg bg-[#0A1220] border text-[#F5F7FA] placeholder-[#8CA4C5]/50 text-xs focus:outline-none transition-colors ${
                          phoneTouched && controls.verifiedPhone && !isPhoneValid
                            ? 'border-rose-500/80 focus:border-rose-500'
                            : 'border-[#202B3D] focus:border-[#2997FF]'
                        }`}
                      />
                      {phoneTouched && controls.verifiedPhone && !isPhoneValid && (
                        <p className="mt-1.5 text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          Please enter a valid international telephone number with country code.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-[#8CA4C5] italic">
                  Note: OTP delivery service integration is configured separately.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── CONTROL 2: Decryption Expiry Time ───────────────────────── */}
        <div className="pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Left: Pill toggle + Icon + Title/Desc */}
            <div className="flex items-center gap-3.5 sm:gap-4 flex-1">
              {/* iOS-style toggle */}
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={controls.expiryEnabled}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      expiryEnabled: e.target.checked,
                    }))
                  }
                  className="sr-only peer"
                  aria-label="Toggle Decryption Expiry Time"
                />
                <div className="w-11 h-6 bg-[#202B3D] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:width-5 after:w-5 after:transition-all peer-checked:bg-[#2997FF]" />
              </label>

              {/* Circular icon container */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  controls.expiryEnabled
                    ? 'bg-[#2997FF]/15 text-[#2997FF] border border-[#2997FF]/30'
                    : 'bg-[#202B3D]/50 text-[#8CA4C5]'
                }`}
              >
                <Clock3 className="w-4 h-4" strokeWidth={1.75} />
              </div>

              {/* Title & Description */}
              <div className="min-w-0">
                <p className="text-sm sm:text-[15px] font-semibold text-[#F5F7FA]">
                  Decryption Expiry Time
                </p>
                <p className="text-xs text-[#8CA4C5] truncate max-w-xs sm:max-w-md">
                  Set a time within the next 24 hours when the file will expire.
                </p>
              </div>
            </div>

            {/* Right: Config / Status + Chevron */}
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-14 sm:pl-0">
              {controls.expiryEnabled ? (
                <div className="text-left sm:text-right">
                  <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-md bg-[#2997FF]/10 text-[#2997FF] border border-[#2997FF]/25">
                    {remainingTimeText || '24 Hours Max'}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-[#8CA4C5] font-medium">
                  No expiry set
                </span>
              )}

              <button
                type="button"
                onClick={() => toggleRow('expiry')}
                className="p-1.5 rounded-lg hover:bg-[#111E30] text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors"
                aria-label="Expand expiry settings"
              >
                {expandedRow === 'expiry' ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Expandable Expiry Details Drawer */}
          {expandedRow === 'expiry' && controls.expiryEnabled && (
            <div className="mt-4 p-4 sm:p-5 rounded-xl bg-[#050913]/90 border border-[#202B3D] text-xs sm:text-sm text-[#A1ADBF] space-y-4">
              <p className="text-xs text-[#8CA4C5] leading-relaxed">
                Choose when the recipient’s access to decrypt the file should expire. The selected time must fall within the next 24 hours.
              </p>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#8CA4C5] mr-1">Quick Select:</span>
                {[1, 6, 12, 24].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setQuickExpiry(hours)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-[#0A1220] hover:bg-[#111E30] text-[#A1ADBF] hover:text-[#2997FF] border border-[#202B3D] transition-colors"
                  >
                    +{hours}h
                  </button>
                ))}
              </div>

              {/* Exact DateTime picker */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label
                  htmlFor="encra-expiry-input"
                  className="text-xs font-semibold text-[#8CA4C5]"
                >
                  Custom Expiry:
                </label>
                <input
                  id="encra-expiry-input"
                  type="datetime-local"
                  min={minTimeString}
                  max={maxTimeString}
                  value={controls.expiryDate}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      expiryDate: e.target.value,
                    }))
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#0A1220] border border-[#202B3D] text-[#F5F7FA] text-xs focus:outline-none focus:border-[#2997FF]"
                />
                <span className="text-xs text-[#2997FF] font-medium">
                  {remainingTimeText}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── CONTROL 3: Location-Based Access ────────────────────────── */}
        <div className="pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Left: Pill toggle + Icon + Title/Desc */}
            <div className="flex items-center gap-3.5 sm:gap-4 flex-1">
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={controls.locationEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked
                    onChange((prev) => ({ ...prev, locationEnabled: checked }))
                    if (checked) setExpandedRow('location')
                  }}
                  className="sr-only peer"
                  aria-label="Toggle Location-Based Access"
                />
                <div className="w-11 h-6 bg-[#202B3D] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:width-5 after:w-5 after:transition-all peer-checked:bg-[#2997FF]" />
              </label>

              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  controls.locationEnabled
                    ? 'bg-[#2997FF]/15 text-[#2997FF] border border-[#2997FF]/30'
                    : 'bg-[#202B3D]/50 text-[#8CA4C5]'
                }`}
              >
                <MapPin className="w-4 h-4" strokeWidth={1.75} />
              </div>

              <div className="min-w-0">
                <p className="text-sm sm:text-[15px] font-semibold text-[#F5F7FA]">
                  Location-Based Access
                </p>
                <p className="text-xs text-[#8CA4C5] truncate max-w-xs sm:max-w-md">
                  Restrict access to a specific location.
                </p>
              </div>
            </div>

            {/* Right: Config / Status + Chevron */}
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-14 sm:pl-0">
              {controls.locationEnabled ? (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#2997FF]/10 text-[#2997FF] border border-[#2997FF]/25">
                  Radius: {controls.radiusKm} km
                </span>
              ) : (
                <span className="text-xs text-[#8CA4C5] font-medium">Off</span>
              )}

              <button
                type="button"
                onClick={() => toggleRow('location')}
                className="p-1.5 rounded-lg hover:bg-[#111E30] text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors"
                aria-label="Expand location settings"
              >
                {expandedRow === 'location' ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Expandable Location Details Drawer */}
          {expandedRow === 'location' && controls.locationEnabled && (
            <div className="mt-4 p-4 sm:p-5 rounded-xl bg-[#050913]/90 border border-[#202B3D] space-y-4">
              {/* Search field */}
              <div>
                <label className="block text-xs font-semibold text-[#8CA4C5] mb-1.5">
                  Search Target Location
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-[#8CA4C5] absolute left-3 top-3" />
                  <input
                    type="text"
                    value={controls.locationQuery}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        locationQuery: e.target.value,
                      }))
                    }
                    placeholder="Enter city, address or coordinates (e.g. London, UK)..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#0A1220] border border-[#202B3D] text-[#F5F7FA] placeholder-[#8CA4C5]/50 text-xs focus:outline-none focus:border-[#2997FF]"
                  />
                </div>
              </div>

              {/* Radius selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <label className="text-xs font-semibold text-[#8CA4C5]">
                  Permitted Radius:
                </label>
                <div className="flex items-center gap-2">
                  {[0.5, 1, 5, 25, 50].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        onChange((prev) => ({ ...prev, radiusKm: r }))
                      }
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                        controls.radiusKm === r
                          ? 'bg-[#2997FF]/20 text-[#2997FF] border-[#2997FF]/50 font-bold'
                          : 'bg-[#0A1220] text-[#A1ADBF] border-[#202B3D] hover:bg-[#111E30]'
                      }`}
                    >
                      {r >= 1 ? `${r} km` : `${r * 1000} m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Map Selection Placeholder with cybernetic grid */}
              <div className="relative h-44 rounded-xl border border-[#202B3D] bg-[#0A1220] overflow-hidden flex flex-col items-center justify-center p-4 text-center">
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage:
                      'radial-gradient(#2997FF 1px, transparent 1px)',
                    backgroundSize: '16px 16px',
                  }}
                />

                <div className="relative z-10 w-12 h-12 rounded-full bg-[#2997FF]/15 border border-[#2997FF]/35 flex items-center justify-center text-[#2997FF] shadow-[0_0_20px_rgba(41,151,255,0.3)] mb-2 animate-pulse">
                  <MapPin className="w-6 h-6" strokeWidth={1.75} />
                </div>

                <p className="text-xs font-semibold text-[#F5F7FA] relative z-10">
                  {controls.locationQuery || 'Location Boundary Active'}
                </p>
                <p className="text-[11px] text-[#8CA4C5] relative z-10">
                  Allowed radius: {controls.radiusKm} km around target coordinates
                </p>
                <span className="mt-2 text-[10px] text-[#2997FF] px-2 py-0.5 rounded-full bg-[#2997FF]/10 border border-[#2997FF]/25">
                  Ready for Google Maps API integration
                </span>
              </div>

              <p className="text-[11px] text-[#8CA4C5] italic">
                Note: Browser geolocation may be inaccurate and is not tamper-proof.
              </p>
            </div>
          )}
        </div>

        {/* ── CONTROL 4: Camera Check ─────────────────────────────────── */}
        <div className="pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 sm:gap-4 flex-1">
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={controls.cameraCheckEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked
                    onChange((prev) => ({
                      ...prev,
                      cameraCheckEnabled: checked,
                    }))
                    if (checked) setExpandedRow('camera')
                  }}
                  className="sr-only peer"
                  aria-label="Toggle Camera Check"
                />
                <div className="w-11 h-6 bg-[#202B3D] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:width-5 after:w-5 after:transition-all peer-checked:bg-[#2997FF]" />
              </label>

              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  controls.cameraCheckEnabled
                    ? 'bg-[#2997FF]/15 text-[#2997FF] border border-[#2997FF]/30'
                    : 'bg-[#202B3D]/50 text-[#8CA4C5]'
                }`}
              >
                <Camera className="w-4 h-4" strokeWidth={1.75} />
              </div>

              <div className="min-w-0">
                <p className="text-sm sm:text-[15px] font-semibold text-[#F5F7FA]">
                  Camera Check
                </p>
                <p className="text-xs text-[#8CA4C5] truncate max-w-xs sm:max-w-md">
                  Use optional camera checks before and during file viewing.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-14 sm:pl-0">
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                  controls.cameraCheckEnabled
                    ? 'bg-[#2997FF]/10 text-[#2997FF] border border-[#2997FF]/25'
                    : 'text-[#8CA4C5]'
                }`}
              >
                {controls.cameraCheckEnabled ? 'Consent Required' : 'Off'}
              </span>

              <button
                type="button"
                onClick={() => toggleRow('camera')}
                className="p-1.5 rounded-lg hover:bg-[#111E30] text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors"
                aria-label="Expand camera check settings"
              >
                {expandedRow === 'camera' ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {expandedRow === 'camera' && controls.cameraCheckEnabled && (
            <div className="mt-4 p-4 sm:p-5 rounded-xl bg-[#050913]/90 border border-[#202B3D] space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={controls.cameraConsentChecked}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      cameraConsentChecked: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded border-[#202B3D] text-[#2997FF] focus:ring-[#2997FF] bg-[#0A1220]"
                />
                <span className="text-xs text-[#F5F7FA] font-medium leading-relaxed">
                  Require recipient explicit camera consent before viewing transfer.
                </span>
              </label>

              <div className="rounded-lg bg-[#2997FF]/10 border border-[#2997FF]/20 p-3 text-xs text-[#8CA4C5] leading-relaxed">
                <span className="font-semibold text-[#F5F7FA]">Privacy Notice: </span>
                Camera access requires the recipient’s permission. Encra must not activate the camera silently.
              </div>

              <p className="text-[11px] text-[#8CA4C5]">
                Architecture ready for client-side WebRTC / face-detection models once activated.
              </p>
            </div>
          )}
        </div>

        {/* ── CONTROL 5: Notifications ─────────────────────────────────── */}
        <div className="pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 sm:gap-4 flex-1">
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={controls.notificationsEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked
                    onChange((prev) => ({
                      ...prev,
                      notificationsEnabled: checked,
                    }))
                    if (checked) setExpandedRow('notifications')
                  }}
                  className="sr-only peer"
                  aria-label="Toggle Notifications"
                />
                <div className="w-11 h-6 bg-[#202B3D] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:width-5 after:w-5 after:transition-all peer-checked:bg-[#2997FF]" />
              </label>

              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  controls.notificationsEnabled
                    ? 'bg-[#2997FF]/15 text-[#2997FF] border border-[#2997FF]/30'
                    : 'bg-[#202B3D]/50 text-[#8CA4C5]'
                }`}
              >
                <BellRing className="w-4 h-4" strokeWidth={1.75} />
              </div>

              <div className="min-w-0">
                <p className="text-sm sm:text-[15px] font-semibold text-[#F5F7FA]">
                  Notifications
                </p>
                <p className="text-xs text-[#8CA4C5] truncate max-w-xs sm:max-w-md">
                  Get notified when your file is accessed or decrypted.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-14 sm:pl-0">
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                  controls.notificationsEnabled
                    ? 'bg-[#2997FF]/10 text-[#2997FF] border border-[#2997FF]/25'
                    : 'text-[#8CA4C5]'
                }`}
              >
                {controls.notificationsEnabled
                  ? controls.notificationType === 'email'
                    ? 'Email Alerts'
                    : 'WhatsApp Alerts'
                  : 'Off'}
              </span>

              <button
                type="button"
                onClick={() => toggleRow('notifications')}
                className="p-1.5 rounded-lg hover:bg-[#111E30] text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors"
                aria-label="Expand notification settings"
              >
                {expandedRow === 'notifications' ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {expandedRow === 'notifications' && controls.notificationsEnabled && (
            <div className="mt-4 p-4 sm:p-5 rounded-xl bg-[#050913]/90 border border-[#202B3D] space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#8CA4C5]">Channel:</span>
                <button
                  type="button"
                  onClick={() =>
                    onChange((prev) => ({ ...prev, notificationType: 'email' }))
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    controls.notificationType === 'email'
                      ? 'bg-[#2997FF]/20 text-[#2997FF] border-[#2997FF]/50'
                      : 'bg-[#0A1220] text-[#A1ADBF] border-[#202B3D] hover:bg-[#111E30]'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Email
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      notificationType: 'whatsapp',
                    }))
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    controls.notificationType === 'whatsapp'
                      ? 'bg-[#2997FF]/20 text-[#2997FF] border-[#2997FF]/50'
                      : 'bg-[#0A1220] text-[#A1ADBF] border-[#202B3D] hover:bg-[#111E30]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8CA4C5] mb-1.5">
                  {controls.notificationType === 'email'
                    ? "Sender's email address (Your email)"
                    : "Sender's WhatsApp number (Your WhatsApp number)"}
                </label>
                <input
                  type={controls.notificationType === 'email' ? 'email' : 'tel'}
                  value={controls.notificationTarget}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      notificationTarget: e.target.value,
                    }))
                  }
                  placeholder={
                    controls.notificationType === 'email'
                      ? 'you@example.com'
                      : '+1 (555) 019-2834'
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0A1220] border border-[#202B3D] text-[#F5F7FA] placeholder-[#8CA4C5]/50 text-xs focus:outline-none focus:border-[#2997FF]"
                />
              </div>

              <p className="text-[11px] text-[#8CA4C5] italic">
                Note: Alerts will be sent to your email or WhatsApp whenever your file is accessed or decrypted.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Subtle Divider & Bottom Action Bar ────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-[#202B3D] flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="relative flex items-center gap-2 text-xs text-[#8CA4C5]">
          <Lock className="w-4 h-4 text-[#2997FF] shrink-0" strokeWidth={1.75} />
          <span>Your files stay private with AES-256-GCM encryption.</span>
          <button
            type="button"
            onClick={() => setShowAesTooltip((prev) => !prev)}
            onMouseEnter={() => setShowAesTooltip(true)}
            onMouseLeave={() => setShowAesTooltip(false)}
            className="text-[#8CA4C5] hover:text-[#2997FF] transition-colors p-0.5"
            aria-label="AES encryption details"
          >
            <Info className="w-3.5 h-3.5" />
          </button>

          {showAesTooltip && (
            <div className="absolute bottom-full left-0 mb-2 w-64 p-3 rounded-lg bg-[#0D1626] border border-[#202B3D] text-[11px] text-[#A1ADBF] shadow-xl z-20 pointer-events-none">
              Client-side encryption executes directly inside your browser before file transmission, ensuring only password holders can decipher data.
            </div>
          )}
        </div>

        <div className="w-full sm:w-auto">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!isReadyToEncrypt || isSubmitting}
            className={`w-full sm:w-auto group inline-flex items-center justify-center gap-2.5 px-8 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-300 ${
              isReadyToEncrypt && !isSubmitting
                ? 'bg-gradient-to-r from-[#2997FF] to-[#0070F3] hover:from-[#38A0FF] hover:to-[#0060DF] text-white shadow-[0_0_24px_rgba(41,151,255,0.35)] active:scale-[0.98] cursor-pointer'
                : 'bg-[#202B3D]/70 text-[#8CA4C5]/60 cursor-not-allowed border border-[#202B3D]'
            }`}
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Validating & Preparing...</span>
              </>
            ) : (
              <>
                <span>Encrypt & Continue</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
