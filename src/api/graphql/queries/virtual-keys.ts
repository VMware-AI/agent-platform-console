import { gql } from '@apollo/client/core'

// Per-user LiteLLM virtual keys (模块④ 虚拟密钥). The secret is returned ONCE — by
// issueVirtualKey / regenerateVirtualKey — and is never queryable again, so the
// list carries only governance metadata. Keys are immutable credentials: there
// is no "update"; you enable/disable, regenerate the secret, or revoke (terminal).

const VIRTUAL_KEY_FIELDS = gql`
  fragment VirtualKeyFields on VirtualKey {
    id
    alias
    userId
    agentId
    rateLimitPolicyId
    status
    expiresAt
    createdAt
  }
`

export const VIRTUAL_KEYS_QUERY = gql`
  query VirtualKeys($userId: ID) {
    virtualKeys(userId: $userId) {
      ...VirtualKeyFields
    }
  }
  ${VIRTUAL_KEY_FIELDS}
`

export const ISSUE_VIRTUAL_KEY = gql`
  mutation IssueVirtualKey($input: IssueVirtualKeyInput!) {
    issueVirtualKey(input: $input) {
      secret
      virtualKey {
        ...VirtualKeyFields
      }
    }
  }
  ${VIRTUAL_KEY_FIELDS}
`

export const REGENERATE_VIRTUAL_KEY = gql`
  mutation RegenerateVirtualKey($id: ID!) {
    regenerateVirtualKey(id: $id) {
      secret
      virtualKey {
        ...VirtualKeyFields
      }
    }
  }
  ${VIRTUAL_KEY_FIELDS}
`

export const SET_VIRTUAL_KEY_ENABLED = gql`
  mutation SetVirtualKeyEnabled($id: ID!, $enabled: Boolean!) {
    setVirtualKeyEnabled(id: $id, enabled: $enabled) {
      ...VirtualKeyFields
    }
  }
  ${VIRTUAL_KEY_FIELDS}
`

export const REVOKE_VIRTUAL_KEY = gql`
  mutation RevokeVirtualKey($id: ID!) {
    revokeVirtualKey(id: $id)
  }
`

export type VirtualKeyStatus = 'active' | 'disabled' | 'revoked'

export interface VirtualKeyNode {
  id: string
  alias: string | null
  userId: string
  agentId: string | null
  rateLimitPolicyId: string | null
  status: VirtualKeyStatus
  expiresAt: string | null
  createdAt: string
}

export interface VirtualKeysVars {
  userId?: string | null
}

export interface VirtualKeysResult {
  virtualKeys: VirtualKeyNode[]
}

export interface IssueVirtualKeyInputVars {
  userId: string
  agentId?: string | null
  rateLimitPolicyId?: string | null
  alias?: string | null
  expiresAt?: string | null
  models?: string[] | null
  maxBudget?: number | null
  rpmLimit?: number | null
  tpmLimit?: number | null
  teamId?: string | null
}

export interface IssueVirtualKeyVars {
  input: IssueVirtualKeyInputVars
}

export interface IssuedVirtualKey {
  secret: string
  virtualKey: VirtualKeyNode
}

export interface IssueVirtualKeyResult {
  issueVirtualKey: IssuedVirtualKey
}

export interface RegenerateVirtualKeyVars {
  id: string
}

export interface RegenerateVirtualKeyResult {
  regenerateVirtualKey: IssuedVirtualKey
}

export interface SetVirtualKeyEnabledVars {
  id: string
  enabled: boolean
}

export interface SetVirtualKeyEnabledResult {
  setVirtualKeyEnabled: VirtualKeyNode
}

export interface RevokeVirtualKeyVars {
  id: string
}

export interface RevokeVirtualKeyResult {
  revokeVirtualKey: boolean
}
