import { gql } from '@apollo/client/core'

// Per-organization LiteLLM virtual keys (令牌管理 / 文档 §4). The secret is
// returned ONCE — by issueVirtualKey / regenerateVirtualKey — and is never
// queryable again, so the list carries only governance metadata. Keys are
// immutable credentials: there is no "update"; you enable/disable, regenerate
// the secret, or revoke (terminal).

// `allowedRoutes` is the explicit whitelist; an empty list here means
// "no restriction" (the frontend's "Allow All Routes" switch ON translates
// to omit-the-field; OFF → fill with /v1/chat/completions etc).
// `spend` + `lastActiveAt` are written by the periodic worker and feed the
// consumption-progress column on the page.

const VIRTUAL_KEY_FIELDS = gql`
  fragment VirtualKeyFields on VirtualKey {
    id
    name
    maskedKey
    organizationId
    status
    duration
    expiresAt
    createdAt
    updatedAt
    spend
    lastActiveAt
    modelGateway {
      id
      name
      baseUrl
    }
    agentId
    models
    maxBudget
    maxParallelRequests
    rpmLimit
    tpmLimit
    rpmLimitType
    tpmLimitType
    budgetDuration
    allowedRoutes
    tags
    blocked
    keyType
    autoRotate
    rotationInterval
  }
`

export const VIRTUAL_KEYS_QUERY = gql`
  query VirtualKeys($organizationId: ID, $agentId: ID, $modelGateway: ID) {
    virtualKeys(organizationId: $organizationId, agentId: $agentId, modelGateway: $modelGateway) {
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

/** Real-time model list for a modelGateway — calls LiteLLM /model/list on
 * demand (no cache). Used to populate the Issue form's `models[]` multi-select
 * once a gateway has been picked. */
export const GATEWAY_AVAILABLE_MODELS = gql`
  query GatewayAvailableModels($gatewayConnectionId: ID!) {
    gatewayAvailableModels(gatewayConnectionId: $gatewayConnectionId)
  }
`

export type VirtualKeyStatus = 'active' | 'disabled' | 'revoked'

// RoutePermission — frontend multi-select enum mapped to /v1/* paths
// (LiteLLM design doc §4.2). The form's "Allow All Routes" switch, when ON,
// OMITS the allowed_routes field entirely; when OFF, the form picks one or
// more of these and translates to ["/v1/chat/completions", ...].
export type RoutePermission = 'CHAT' | 'EMBEDDINGS' | 'IMAGES' | 'AUDIO'

export const ROUTE_PERMISSIONS: RoutePermission[] = [
  'CHAT',
  'EMBEDDINGS',
  'IMAGES',
  'AUDIO',
]

// Mapping from RoutePermission enum to the literal /v1/* path the
// gateway's allowed_routes list expects. Kept here (next to the enum) so
// the form never has to know the wire shape — it just picks CHAT and the
// resolver-side translation in submit() turns it into "/v1/chat/completions".
export const ROUTE_PERMISSION_PATHS: Record<RoutePermission, string> = {
  CHAT: '/v1/chat/completions',
  EMBEDDINGS: '/v1/embeddings',
  IMAGES: '/v1/images/generations',
  AUDIO: '/v1/audio/*',
}

export interface VirtualKeyNode {
  id: string
  name: string
  maskedKey: string | null
  organizationId: string | null
  status: VirtualKeyStatus
  duration: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  spend: number
  lastActiveAt: string | null
  modelGateway: { id: string; name: string; baseUrl: string } | null
  agentId: string | null
  models: string[]
  maxBudget: number | null
  maxParallelRequests: number | null
  rpmLimit: number | null
  tpmLimit: number | null
  rpmLimitType: string | null
  tpmLimitType: string | null
  budgetDuration: string | null
  allowedRoutes: string[]
  tags: string[]
  blocked: boolean
  keyType: string
  autoRotate: boolean
  rotationInterval: string | null
}

export interface VirtualKeysVars {
  organizationId?: string | null
  agentId?: string | null
  modelGateway?: string | null
}

export interface VirtualKeysResult {
  virtualKeys: VirtualKeyNode[]
}

export interface IssueVirtualKeyInputVars {
  organizationId: string
  name: string
  modelGateway: string
  agentId?: string | null
  duration?: string | null
  expiresAt?: string | null
  models?: string[] | null
  maxBudget?: number | null
  rpmLimit?: number | null
  tpmLimit?: number | null
  budgetDuration?: string | null
  maxParallelRequests?: number | null
  rpmLimitType?: string | null
  tpmLimitType?: string | null
  // The frontend OMITS this field (not even an empty array) when the
  // "Allow All Routes" switch is ON; the resolver sees nil and litellm
  // applies its default (no restriction). When the switch is OFF, the
  // form sends the explicit list of /v1/* paths.
  allowedRoutes?: string[] | null
  tags?: string[] | null
  blocked?: boolean | null
  keyType?: string | null
  autoRotate?: boolean | null
  rotationInterval?: string | null
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

export interface GatewayAvailableModelsVars {
  gatewayConnectionId: string
}

export interface GatewayAvailableModelsResult {
  gatewayAvailableModels: string[]
}