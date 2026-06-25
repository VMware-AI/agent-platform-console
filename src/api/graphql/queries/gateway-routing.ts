import { gql } from '@apollo/client/core'

// Upstreams & router tiers (上游与路由分层 / 模型网关配置). These are platform-global
// gateway-routing config from schema/gateway-routing.graphql, gated by the
// `route:manage` permission:
//   - Upstream: a concrete backend (vllm/openai/anthropic/minimax/codex) + model.
//     upsertUpstream keys by `name`; apiKey is write-only (secret store, never read
//     back), so the list never exposes credentials.
//   - RouterTier: maps a difficulty tier (SIMPLE/MEDIUM/COMPLEX/REASONING) to a
//     model alias; setRouterTier is the only write and syncs the litellm router.

export const UPSTREAM_PROVIDERS = ['vllm', 'openai', 'anthropic', 'minimax', 'codex'] as const
export type UpstreamProvider = (typeof UPSTREAM_PROVIDERS)[number]

export const ROUTER_TIER_LEVELS = ['SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING'] as const
export type RouterTierLevel = (typeof ROUTER_TIER_LEVELS)[number]

const UPSTREAM_FIELDS = gql`
  fragment UpstreamRoutingFields on Upstream {
    id
    name
    provider
    apiBase
    model
    enabled
    createdAt
  }
`

const ROUTER_TIER_FIELDS = gql`
  fragment RouterTierRoutingFields on RouterTier {
    id
    tier
    modelAlias
  }
`

export const UPSTREAMS_ROUTING_QUERY = gql`
  query UpstreamsRouting {
    upstreams {
      ...UpstreamRoutingFields
    }
  }
  ${UPSTREAM_FIELDS}
`

export const UPSERT_UPSTREAM_ROUTING = gql`
  mutation UpsertUpstreamRouting($input: UpsertUpstreamInput!) {
    upsertUpstream(input: $input) {
      ...UpstreamRoutingFields
    }
  }
  ${UPSTREAM_FIELDS}
`

export const DELETE_UPSTREAM_ROUTING = gql`
  mutation DeleteUpstreamRouting($id: ID!) {
    deleteUpstream(id: $id)
  }
`

export const ROUTER_TIERS_ROUTING_QUERY = gql`
  query RouterTiersRouting {
    routerTiers {
      ...RouterTierRoutingFields
    }
  }
  ${ROUTER_TIER_FIELDS}
`

export const SET_ROUTER_TIER_ROUTING = gql`
  mutation SetRouterTierRouting($tier: RouterTierLevel!, $modelAlias: String!) {
    setRouterTier(tier: $tier, modelAlias: $modelAlias) {
      ...RouterTierRoutingFields
    }
  }
  ${ROUTER_TIER_FIELDS}
`

export interface UpstreamNode {
  id: string
  name: string
  provider: UpstreamProvider
  apiBase: string | null
  model: string
  enabled: boolean
  createdAt: string
}

export interface UpstreamsRoutingResult {
  upstreams: UpstreamNode[]
}

export interface UpsertUpstreamRoutingVars {
  input: {
    name: string
    provider: UpstreamProvider
    apiBase?: string | null
    apiKey?: string | null
    apiKeyRef?: string | null
    model: string
    enabled?: boolean
  }
}

export interface UpsertUpstreamRoutingResult {
  upsertUpstream: UpstreamNode
}

export interface DeleteUpstreamRoutingVars {
  id: string
}

export interface DeleteUpstreamRoutingResult {
  deleteUpstream: boolean
}

export interface RouterTierNode {
  id: string
  tier: RouterTierLevel
  modelAlias: string
}

export interface RouterTiersRoutingResult {
  routerTiers: RouterTierNode[]
}

export interface SetRouterTierRoutingVars {
  tier: RouterTierLevel
  modelAlias: string
}

export interface SetRouterTierRoutingResult {
  setRouterTier: RouterTierNode
}
