export type RateLimitType = 'TOKEN' | 'REQUEST' | 'COMBINED'

export interface RateLimitPolicy {
  id: string
  name: string
  type: RateLimitType
  tokenLimitPerMinute: number
  requestLimitPerMinute: number
  enabled: boolean
}

export interface RateLimitPolicyDraft {
  name: string
  type: RateLimitType
  tokenLimitPerMinute: number
  requestLimitPerMinute: number
  enabled: boolean
}

export const RATE_LIMIT_TYPES: RateLimitType[] = ['TOKEN', 'REQUEST', 'COMBINED']
