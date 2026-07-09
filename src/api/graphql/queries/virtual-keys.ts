import { gql } from '@apollo/client/core'

// Per-organization LiteLLM virtual keys (令牌管理 / 文档 §4). The secret is
// returned ONCE — by issueVirtualKey — and is never queryable again, so
// the list carries only governance metadata. Keys are immutable
// credentials: there is no "update"; you enable/disable or revoke
// (terminal).

// `allowedRoutes` is the explicit whitelist; an empty list here means
// "no restriction" (the frontend's "Allow All APIs" switch ON translates
// to omit-the-field; OFF → fill with /v1/chat/completions etc).
// `spend` + `lastActiveAt` are written by the periodic worker and feed the
// consumption-progress column on the page.

// Trimmed to the exact field set the VirtualKeyView displays / the row
// actions consume:
//   - id, name, maskedKey, status            — the row's identity + state
//   - agent { id, name }                     — AGENT column's display + copy-id
//   - modelGateway { id, name }              — MODEL_GATEWAY column's display
//   - models[]                               — MODELS column's per-model badges
//   - expiresAt, createdAt, updatedAt,
//     lastActiveAt                           — the four date columns
//   - spend, maxBudget                       — PROGRESS column (consumption bar)
//
// The governance fields below (rpmLimit / tpmLimit / allowedRoutes /
// keyType / tags / autoRotate / ...) are NOT rendered on the list —
// they're included ONLY to support the row's 克隆 action, which
// re-opens the issue form pre-populated from the source row. Adding them
// here keeps the clone path single-roundtrip; fetching a single VirtualKey
// by id would require a new query + a second roundtrip on every clone
// click, with no UX win. The fields are all `Int!` / `String` / etc and
// contribute negligible payload weight.
//
// The mutation result fragments below reuse this same fragment; the only
// mutation field the page actually reads is `secret` (in the secret-reveal
// dialog), so dropping the other VirtualKey fields is safe end-to-end.
//
// IMPORTANT: `metadata` is an INPUT-only field on `IssueVirtualKeyInput`
// (and `UpdateVirtualKeyInput` once that lands); it's NOT a field on the
// `VirtualKey` read-side type — GraphQL will reject the query with
// "Cannot query field 'metadata' on type 'VirtualKey'" if it's selected
// here. The clone prefill sources its `metadata` from the *input* shape
// (built fresh from `tags` + helpers), not from a read-back of the row's
// own metadata bucket.
const VIRTUAL_KEY_FIELDS = gql`
  fragment VirtualKeyFields on VirtualKey {
    id
    name
    maskedKey
    status
    agent {
      id
      name
    }
    modelGateway {
      id
      name
    }
    models
    expiresAt
    createdAt
    updatedAt
    lastActiveAt
    spend
    maxBudget
    budgetDuration
    maxParallelRequests
    rpmLimit
    tpmLimit
    rpmLimitType
    tpmLimitType
    keyType
    autoRotate
    rotationInterval
    allowedRoutes
    tags
  }
`

// `virtualKeys` takes five flat parameters — no structured filter input.
// Mirrors the backend's `virtualKeys(...)` signature:
//   - agentName    : case-insensitive substring match on Agent.name — the
//                    AGENT column's free-text filter.
//   - modelGateway : exact-match on ModelGateway.id — populated by the
//                    MODEL_GATEWAY column's select-style option list.
//   - nameContains / modelContains : case-insensitive `contains` against
//                    VirtualKey.name and VirtualKey.models[].
//   - orderBy      : server-side sort. NAME and EXPIRES_AT are the only
//                    axes exposed by the page today; the client's local
//                    sort has been removed in favor of this.
// `null` on every field is the canonical "no filter" / "default order".
// `nameEquals` is the live-duplicate-check used by the issue form
// (case-sensitive — matches the backend partial unique index). When
// paired with `modelGateway`, the B-tree on (model_gateway_id, name)
// covers the query; otherwise it falls back to a sequential scan.
export const VIRTUAL_KEYS_QUERY = gql`
  query VirtualKeys(
    $agentName: String
    $modelGateway: ID
    $nameContains: String
    $nameEquals: String
    $modelContains: String
    $orderBy: VirtualKeyOrderBy
  ) {
    virtualKeys(
      agentName: $agentName
      modelGateway: $modelGateway
      nameContains: $nameContains
      nameEquals: $nameEquals
      modelContains: $modelContains
      orderBy: $orderBy
    ) {
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

// Admin-only: bulk-delete revoked VirtualKey rows past a wall-clock
// cutoff. The console exposes this behind a confirm dialog gated on
// `auth.role === 'admin'`; backend re-checks via @hasRole(any:[admin]).
export const PURGE_REVOKED_VIRTUAL_KEYS = gql`
  mutation PurgeRevokedVirtualKeys($beforeTime: Time!) {
    purgeRevokedVirtualKeys(beforeTime: $beforeTime) {
      deletedCount
      oldestRemainingUpdatedAt
    }
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
// (LiteLLM design doc §4.2). The form's "Allow All APIs" switch, when ON,
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

/**
 * Wire shape of `metadata` on VirtualKey read + write paths. Only
 * `tags` is currently consumed by the console; `index` records any
 * other backend-owned keys (e.g. `description`, `owner`) so we
 * don't silently lose data when round-tripping. Adding a new metadata
 * field means extending `index` rather than reverting to
 * `Record<string, any>`. `index` is optional because the form submits
 * `{ tags }` without an `index` when the user hasn't set any extras.
 */
export interface VirtualKeyMetadata {
  tags: string[]
  index?: Record<string, string | number | boolean | null>
}

export interface VirtualKeyNode {
  id: string
  name: string
  maskedKey: string | null
  status: VirtualKeyStatus
  modelGateway: { id: string; name: string } | null
  // Backend removed the `agentId` scalar and replaced it with the `agent`
  // object — read-side consumers pull agentId via `agent?.id` and the
  // display name via `agent?.name`. Matches the schema hint returned when
  // selecting the old field: "Did you mean 'agent'?".
  agent: { id: string; name: string } | null
  models: string[]
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  lastActiveAt: string | null
  spend: number
  maxBudget: number | null
  // Fields below are fetched for the row's 克隆 action — the issue
  // form's prefill uses them. They aren't rendered on the list, but
  // keeping them on the read-side type avoids a second roundtrip
  // (single-VirtualKey by id) when the operator clicks 克隆.
  budgetDuration: string | null
  maxParallelRequests: number | null
  rpmLimit: number | null
  tpmLimit: number | null
  rpmLimitType: string | null
  tpmLimitType: string | null
  keyType: string
  autoRotate: boolean
  rotationInterval: string | null
  allowedRoutes: string[] | null
  // `tags` is the read-side bucket the backend stores per-key; the
  // *write* side (IssueVirtualKeyInput) receives tags under
  // `metadata.tags` for protocol parity with the deploy flows. The
  // clone prefill reconstructs `metadata: { tags: [...] }` from this
  // field — see `virtualKeyToIssueInput` in src/utils/.
  tags: string[] | null
}

/** Mirrors the backend's `VirtualKeyOrderBy` enum — the only sort axes
 * exposed on the page today are NAME and EXPIRES_AT, but the type
 * enumerates the full backend set so the orderBy plumbing can grow
 * without touching consumers when new sortable columns are added. */
export type VirtualKeyOrderBy =
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'EXPIRES_AT_ASC'
  | 'EXPIRES_AT_DESC'
  | 'CREATED_AT_ASC'
  | 'CREATED_AT_DESC'
  | 'UPDATED_AT_ASC'
  | 'UPDATED_AT_DESC'

/** Flat variable shape for the `virtualKeys(...)` query — five sibling
 * parameters, no structured filter wrapper. `null` on every field is the
 * canonical "no filter" / "default order" wire value. */
export interface VirtualKeysVars {
  agentName?: string | null
  modelGateway?: string | null
  nameContains?: string | null
  // Exact-match filter on VirtualKey.name (case-sensitive). Powers the
  // issue form's live duplicate check; null skips the filter.
  nameEquals?: string | null
  modelContains?: string | null
  orderBy?: VirtualKeyOrderBy | null
}

export interface VirtualKeysResult {
  virtualKeys: VirtualKeyNode[]
}

export interface IssueVirtualKeyInputVars {
  name: string
  modelGateway: string
  agentId?: string | null
  // Backend added `userId` to IssueVirtualKeyInput (caller-supplied
  // owner/creator id, default 'admin' on the dev console for now).
  // Frontend hardcodes 'admin' here per current product scope; once
  // auth.user.id is wired up to a real session, this should read from
  // the auth store instead of being a literal.
  userId?: string | null
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
  // "Allow All APIs" switch is ON; the resolver sees nil and litellm
  // applies its default (no restriction). When the switch is OFF, the
  // form sends the explicit list of /v1/* paths.
  allowedRoutes?: string[] | null
  // Per the IssueVirtualKeyInput contract change, `tags` is no longer a
  // top-level field — it now travels under `metadata.tags` (a JSON value)
  // to align with the deploy-side metadata bucket. The read-side
  // `VirtualKey.tags` (and the DB column behind it) is unchanged, so list
  // views still surface tags at the top level.
  metadata?: VirtualKeyMetadata | null
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

export interface PurgeRevokedVirtualKeysVars {
  beforeTime: string
}

export interface PurgeRevokedVirtualKeysResult {
  purgeRevokedVirtualKeys: {
    deletedCount: number
    oldestRemainingUpdatedAt: string | null
  }
}

export interface GatewayAvailableModelsVars {
  gatewayConnectionId: string
}

export interface GatewayAvailableModelsResult {
  gatewayAvailableModels: string[]
}