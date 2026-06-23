/**
 * Password complexity helpers — shared between `UserFormDialog.vue` (live
 * feedback as the user types) and the `createUser` / `resetUserPassword`
 * GraphQL resolvers (authoritative second check).
 *
 * Rules (mirrored on both sides so the UX and the backend agree):
 *   - length >= 10
 *   - contains at least one uppercase letter
 *   - contains at least one lowercase letter
 *   - contains at least one digit
 *   - contains at least one symbol from `!@#$%^&*()_+\-=[]{};':"\\|,.<>/?`
 */

export interface ComplexityResult {
  ok: boolean
  /** Empty when `ok` is true; otherwise one human-readable reason per failed rule. */
  reasons: string[]
}

const SYMBOL_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/

export function passwordMeets(pwd: string): ComplexityResult {
  const reasons: string[] = []
  if (!pwd || pwd.length < 10) reasons.push('长度至少 10 位')
  if (!/[A-Z]/.test(pwd)) reasons.push('需含大写字母')
  if (!/[a-z]/.test(pwd)) reasons.push('需含小写字母')
  if (!/\d/.test(pwd)) reasons.push('需含数字')
  if (!SYMBOL_REGEX.test(pwd)) reasons.push('需含特殊符号')
  return { ok: reasons.length === 0, reasons }
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGIT = '23456789'
const SYMBOL = '!@#$%^&*'
const ALL = UPPER + LOWER + DIGIT + SYMBOL

/** Returns a float in [0, 1) using `crypto.getRandomValues` — browser-native
 *  CSPRNG, no dependency on `Math.random`. */
function secureRand(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] / 0x1_0000_0000
}

function pick(s: string): string {
  return s[Math.floor(secureRand() * s.length)]
}

/**
 * Generate a random password that is guaranteed to satisfy `passwordMeets`.
 * Default length is 16 — long enough to satisfy the length rule with margin
 * while still being paste-able.
 */
export function generatePassword(length = 16): string {
  // Seed one of each category so the result always passes the complexity
  // rules; then fill the rest with mixed characters.
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)]
  while (chars.length < length) chars.push(pick(ALL))

  // Fisher–Yates shuffle so the category seeds aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(secureRand() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}