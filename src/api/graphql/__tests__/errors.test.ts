import { describe, expect, it } from 'vitest'

import { graphqlErrorMessage } from '@/api/graphql/errors'

const FALLBACK = 'Something went wrong'

describe('graphqlErrorMessage', () => {
  it('returns the first GraphQL error message (backend domain message wins)', () => {
    const error = {
      graphQLErrors: [{ message: 'policy is in use by 2 virtual key(s); reassign or revoke them first' }],
      message: 'generic apollo wrapper message',
    }

    expect(graphqlErrorMessage(error, FALLBACK)).toBe(
      'policy is in use by 2 virtual key(s); reassign or revoke them first',
    )
  })

  it('skips empty graphQLErrors entries and returns the first one that has a message', () => {
    const error = {
      graphQLErrors: [{}, { message: '' }, { message: 'real domain failure' }],
      message: 'wrapper',
    }

    // The first entry with a truthy message must win, not the wrapper.
    expect(graphqlErrorMessage(error, FALLBACK)).toBe('real domain failure')
  })

  it('falls back to the network/error message when there are no GraphQL errors', () => {
    const error = { message: 'Failed to fetch' }

    expect(graphqlErrorMessage(error, FALLBACK)).toBe('Failed to fetch')
  })

  it('uses the network/error message when graphQLErrors is an empty array', () => {
    const error = { graphQLErrors: [], message: 'NetworkError: connection refused' }

    expect(graphqlErrorMessage(error, FALLBACK)).toBe('NetworkError: connection refused')
  })

  it('uses the message from a real Error instance', () => {
    const error = new Error('boom from native error')

    expect(graphqlErrorMessage(error, FALLBACK)).toBe('boom from native error')
  })

  it('returns the fallback when graphQLErrors entries have no usable message and no top-level message', () => {
    const error = { graphQLErrors: [{}, { message: '' }] }

    expect(graphqlErrorMessage(error, FALLBACK)).toBe(FALLBACK)
  })

  it('returns the fallback for an empty object (no graphQLErrors, no message)', () => {
    expect(graphqlErrorMessage({}, FALLBACK)).toBe(FALLBACK)
  })

  it('returns the fallback when the top-level message is an empty string', () => {
    expect(graphqlErrorMessage({ message: '' }, FALLBACK)).toBe(FALLBACK)
  })

  it('returns the fallback for null', () => {
    expect(graphqlErrorMessage(null, FALLBACK)).toBe(FALLBACK)
  })

  it('returns the fallback for undefined', () => {
    expect(graphqlErrorMessage(undefined, FALLBACK)).toBe(FALLBACK)
  })

  it('returns the fallback for primitive (non-object) errors', () => {
    expect(graphqlErrorMessage('a string error', FALLBACK)).toBe(FALLBACK)
    expect(graphqlErrorMessage(42, FALLBACK)).toBe(FALLBACK)
  })
})
