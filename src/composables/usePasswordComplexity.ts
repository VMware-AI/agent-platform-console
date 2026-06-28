/**
 * Password complexity helpers — shared between `UserFormDialog.vue` (live
 * feedback as the user types) and the `createUser` / `resetUserPassword`
 * GraphQL resolvers (authoritative second check).
 *
 * Rules (mirrored on both sides so the UX and the backend agree):
 *   - length >= 12
 *   - contains at least one uppercase letter
 *   - contains at least one lowercase letter
 *   - contains at least one digit
 *
 * Special symbols (!@#$%^&* etc.) are allowed but NOT required — the backend
 * hashes via bcrypt (cost 12) and bcrypt truncates input at 72 bytes
 * internally, so we don't enforce a max length.
 */

export interface ComplexityResult {
  ok: boolean
  /** Empty when `ok` is true; otherwise one human-readable reason per failed rule. */
  reasons: string[]
}

export function passwordMeets(pwd: string): ComplexityResult {
  const reasons: string[] = []
  if (!pwd || pwd.length < 12) reasons.push('长度至少 12 位')
  if (!/[A-Z]/.test(pwd)) reasons.push('需含大写字母')
  if (!/[a-z]/.test(pwd)) reasons.push('需含小写字母')
  if (!/\d/.test(pwd)) reasons.push('需含数字')
  return { ok: reasons.length === 0, reasons }
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGIT = '23456789'
const ALL = UPPER + LOWER + DIGIT

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
  // Seed one of each required category so the result always passes the
  // complexity rules; then fill the rest with mixed characters.
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)]
  while (chars.length < length) chars.push(pick(ALL))

  // Fisher–Yates shuffle so the category seeds aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(secureRand() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}