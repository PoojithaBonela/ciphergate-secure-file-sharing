import { createHmac } from 'node:crypto'
import { config } from '../config/env'
import { HttpError } from '../middleware/errorHandler'

/**
 * Strict regex for seven-word secret code:
 * - Exactly seven lowercase words.
 * - Only letters a-z.
 * - Single ordinary space between words.
 * - No leading, trailing, or consecutive spaces.
 * - No numbers, symbols, uppercase, or tabs.
 */
export const SEVEN_WORD_REGEX = /^[a-z]+( [a-z]+){6}$/

/**
 * Validates that the input is an exact 7-word phrase matching the strict criteria.
 */
export function isValidSevenWordCode(phrase: string): boolean {
  if (typeof phrase !== 'string') return false
  return SEVEN_WORD_REGEX.test(phrase)
}

/**
 * Computes an HMAC-SHA-256 fingerprint of the 7-word secret code using ENCRA_LOOKUP_SECRET.
 * Never stores or returns the raw phrase.
 */
export function computeLookupFingerprint(phrase: string): string {
  if (!config.lookupSecret || config.lookupSecret.trim().length === 0) {
    throw new HttpError(
      500,
      'Internal server security configuration error: lookup secret is unconfigured.',
    )
  }

  if (!isValidSevenWordCode(phrase)) {
    throw new HttpError(
      400,
      'Secret code must be exactly seven lowercase words separated by single spaces.',
    )
  }

  return createHmac('sha256', config.lookupSecret)
    .update(phrase.trim())
    .digest('hex')
}
