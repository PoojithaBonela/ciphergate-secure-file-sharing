import { useState } from 'react'
import { Lock, Eye, EyeOff, Info, Check, Circle, AlertCircle } from 'lucide-react'
import { evaluatePassword } from './passwordUtils'

export interface PasswordSetupPanelProps {
  password: string
  confirmPassword: string
  onPasswordChange: (val: string) => void
  onConfirmPasswordChange: (val: string) => void
}

export default function PasswordSetupPanel({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
}: PasswordSetupPanelProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const { strength, hasMinLength, hasSpecialChar, hasNumberAndUpper } =
    evaluatePassword(password)

  const isMatching = confirmPassword.length > 0 && password === confirmPassword
  const isMismatch = confirmPassword.length > 0 && password !== confirmPassword

  const strengthColorMap = {
    empty: { text: 'text-[#8CA4C5]', label: 'None', bg: 'bg-[#202B3D]' },
    low: { text: 'text-rose-400', label: 'Low', bg: 'bg-rose-500' },
    medium: { text: 'text-amber-400', label: 'Medium', bg: 'bg-amber-400' },
    high: { text: 'text-teal-400', label: 'High', bg: 'bg-teal-400' },
  }

  const currentStrength = strengthColorMap[strength]

  return (
    <div className="w-full rounded-2xl bg-[#0A1220]/80 backdrop-blur-sm border border-[#202B3D] p-6 sm:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* ── Left Column: Password Fields ────────────────────────────── */}
        <div className="flex flex-col">
          <h3 className="text-lg font-bold text-[#F5F7FA] mb-1">
            Set a Password
          </h3>
          <p className="text-sm text-[#A1ADBF] mb-6">
            Choose a strong password to protect your file.
          </p>

          <div className="space-y-5">
            {/* Enter Password */}
            <div>
              <label
                htmlFor="encra-password"
                className="block text-xs font-semibold uppercase tracking-wider text-[#8CA4C5] mb-2"
              >
                Enter Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8CA4C5]">
                  <Lock className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <input
                  id="encra-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="Enter a secure password..."
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-[#050913] border border-[#202B3D] text-[#F5F7FA] placeholder-[#8CA4C5]/60 text-sm focus:outline-none focus:border-[#2997FF] focus:ring-1 focus:ring-[#2997FF] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors"
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

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="encra-confirm-password"
                className="block text-xs font-semibold uppercase tracking-wider text-[#8CA4C5] mb-2"
              >
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8CA4C5]">
                  <Lock className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <input
                  id="encra-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => onConfirmPasswordChange(e.target.value)}
                  placeholder="Confirm your password..."
                  className={`w-full pl-10 pr-11 py-2.5 rounded-xl bg-[#050913] border text-[#F5F7FA] placeholder-[#8CA4C5]/60 text-sm focus:outline-none transition-all ${
                    isMismatch
                      ? 'border-rose-500/80 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                      : isMatching
                      ? 'border-teal-500/80 focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
                      : 'border-[#202B3D] focus:border-[#2997FF] focus:ring-1 focus:ring-[#2997FF]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8CA4C5] hover:text-[#F5F7FA] transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Status messages for password match */}
              {isMismatch && (
                <p className="mt-2 text-xs text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Passwords do not match.
                </p>
              )}
              {isMatching && (
                <p className="mt-2 text-xs text-teal-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  Passwords match perfectly.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column: Strength & Recommendations ───────────────── */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-[#F5F7FA]">
                Password Strength
              </h3>
              <span className={`text-xs font-bold uppercase tracking-wider ${currentStrength.text}`}>
                {currentStrength.label}
              </span>
            </div>

            {/* Segmented Strength Meter (3 segments) */}
            <div className="grid grid-cols-3 gap-2 mb-6" role="progressbar" aria-valuenow={strength === 'high' ? 100 : strength === 'medium' ? 66 : strength === 'low' ? 33 : 0} aria-valuemin={0} aria-valuemax={100}>
              {/* Segment 1 */}
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  strength !== 'empty' ? currentStrength.bg : 'bg-[#202B3D]'
                }`}
              />
              {/* Segment 2 */}
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  strength === 'medium' || strength === 'high'
                    ? currentStrength.bg
                    : 'bg-[#202B3D]'
                }`}
              />
              {/* Segment 3 */}
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  strength === 'high' ? currentStrength.bg : 'bg-[#202B3D]'
                }`}
              />
            </div>

            {/* Recommendations Box */}
            <div className="rounded-xl bg-[#050913]/90 border border-[#202B3D]/80 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-[#2997FF]" strokeWidth={1.75} />
                <span className="text-xs font-semibold tracking-wider uppercase text-[#F5F7FA]">
                  Recommendations
                </span>
              </div>

              <ul className="space-y-2.5 text-xs sm:text-[13px] text-[#A1ADBF]">
                {/* Rule 1: Min 8 chars */}
                <li className="flex items-center gap-2.5 transition-colors">
                  {hasMinLength ? (
                    <div className="w-4 h-4 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-[#8CA4C5]/60 shrink-0" strokeWidth={1.5} />
                  )}
                  <span className={hasMinLength ? 'text-[#F5F7FA]' : 'text-[#8CA4C5]'}>
                    Use at least 8 characters.
                  </span>
                </li>

                {/* Rule 2: Special character */}
                <li className="flex items-center gap-2.5 transition-colors">
                  {hasSpecialChar ? (
                    <div className="w-4 h-4 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-[#8CA4C5]/60 shrink-0" strokeWidth={1.5} />
                  )}
                  <span className={hasSpecialChar ? 'text-[#F5F7FA]' : 'text-[#8CA4C5]'}>
                    Include a special symbol (!@#).
                  </span>
                </li>

                {/* Rule 3: Numbers and uppercase */}
                <li className="flex items-center gap-2.5 transition-colors">
                  {hasNumberAndUpper ? (
                    <div className="w-4 h-4 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-[#8CA4C5]/60 shrink-0" strokeWidth={1.5} />
                  )}
                  <span className={hasNumberAndUpper ? 'text-[#F5F7FA]' : 'text-[#8CA4C5]'}>
                    Add numbers and uppercase letters.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
