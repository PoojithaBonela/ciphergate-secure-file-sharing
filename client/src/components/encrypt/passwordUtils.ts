export type StrengthLevel = 'empty' | 'low' | 'medium' | 'high'

export function evaluatePassword(pwd: string): {
  strength: StrengthLevel
  hasMinLength: boolean
  hasSpecialChar: boolean
  hasNumberAndUpper: boolean
  hasLower: boolean
} {
  const hasMinLength = pwd.length >= 8
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/`~]/.test(pwd)
  const hasUpper = /[A-Z]/.test(pwd)
  const hasLower = /[a-z]/.test(pwd)
  const hasNumber = /[0-9]/.test(pwd)
  const hasNumberAndUpper = hasUpper && hasNumber

  if (!pwd) {
    return {
      strength: 'empty',
      hasMinLength: false,
      hasSpecialChar: false,
      hasNumberAndUpper: false,
      hasLower: false,
    }
  }

  // Calculate score
  let score = 0
  if (hasMinLength) score += 1
  if (pwd.length >= 12) score += 1
  if (hasSpecialChar) score += 1
  if (hasUpper) score += 1
  if (hasLower) score += 1
  if (hasNumber) score += 1

  // Avoid obvious repetition e.g. "aaaa" or "1111"
  if (/(\w)\1{2,}/.test(pwd)) {
    score = Math.max(1, score - 1)
  }

  let strength: StrengthLevel = 'low'
  if (hasMinLength && score >= 5 && hasSpecialChar && (hasUpper || hasNumber)) {
    strength = 'high'
  } else if (hasMinLength && score >= 3) {
    strength = 'medium'
  } else {
    strength = 'low'
  }

  return {
    strength,
    hasMinLength,
    hasSpecialChar,
    hasNumberAndUpper,
    hasLower,
  }
}
