/**
 * Extract a user-facing message from a thrown Apollo / GraphQL error.
 *
 * Prefers the first GraphQL error message — these carry backend domain messages
 * like "policy is in use by 2 virtual key(s); reassign or revoke them first" —
 * then falls back to the network/error message, then a caller-supplied generic.
 */
export function graphqlErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const gqlErrors = (error as { graphQLErrors?: ReadonlyArray<{ message?: string }> }).graphQLErrors
    const first = gqlErrors?.find((e) => e?.message)?.message
    if (first) return first
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return fallback
}
