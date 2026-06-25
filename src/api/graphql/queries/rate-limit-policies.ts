import { gql } from '@apollo/client/core'

// Rate-limit policies (模块⑤ 限流). The backend keys upsert by `name` within the
// caller's tenant, so the create/edit form treats name as the immutable identity.
// rpm/tpm are the raw per-minute request/token caps; the UI derives a display
// `type` (COMBINED / REQUEST / TOKEN) from which of them are set.

const RATE_LIMIT_POLICY_FIELDS = gql`
  fragment RateLimitPolicyFields on RateLimitPolicy {
    id
    name
    rpm
    tpm
    enabled
    createdAt
  }
`

export const RATE_LIMIT_POLICIES_QUERY = gql`
  query RateLimitPolicies {
    rateLimitPolicies {
      ...RateLimitPolicyFields
    }
  }
  ${RATE_LIMIT_POLICY_FIELDS}
`

export const UPSERT_RATE_LIMIT_POLICY = gql`
  mutation UpsertRateLimitPolicy($input: UpsertRateLimitPolicyInput!) {
    upsertRateLimitPolicy(input: $input) {
      ...RateLimitPolicyFields
    }
  }
  ${RATE_LIMIT_POLICY_FIELDS}
`

export const SET_RATE_LIMIT_POLICY_ENABLED = gql`
  mutation SetRateLimitPolicyEnabled($id: ID!, $enabled: Boolean!) {
    setRateLimitPolicyEnabled(id: $id, enabled: $enabled) {
      ...RateLimitPolicyFields
    }
  }
  ${RATE_LIMIT_POLICY_FIELDS}
`

export const DELETE_RATE_LIMIT_POLICY = gql`
  mutation DeleteRateLimitPolicy($id: ID!) {
    deleteRateLimitPolicy(id: $id)
  }
`

export interface RateLimitPolicyNode {
  id: string
  name: string
  rpm: number | null
  tpm: number | null
  enabled: boolean
  createdAt: string
}

export interface RateLimitPoliciesResult {
  rateLimitPolicies: RateLimitPolicyNode[]
}

export interface UpsertRateLimitPolicyVars {
  input: {
    name: string
    rpm?: number | null
    tpm?: number | null
    enabled?: boolean
  }
}

export interface UpsertRateLimitPolicyResult {
  upsertRateLimitPolicy: RateLimitPolicyNode
}

export interface SetRateLimitPolicyEnabledVars {
  id: string
  enabled: boolean
}

export interface SetRateLimitPolicyEnabledResult {
  setRateLimitPolicyEnabled: RateLimitPolicyNode
}

export interface DeleteRateLimitPolicyVars {
  id: string
}

export interface DeleteRateLimitPolicyResult {
  deleteRateLimitPolicy: boolean
}
