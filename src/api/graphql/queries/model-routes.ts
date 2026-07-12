import { gql } from '@apollo/client/core'

// Model routes (模型路由). A route maps an outward name to a single
// supportedModels entry (a litellm model group) hosted by exactly one
// `modelGateway`. The `modelGateway` field is a resolved nested object
// (non-null) — the backend holds the FK and exposes it through the
// gateway row. `gatewayName` was previously a denormalized string on
// the route; that field is gone now that the route carries the gateway
// object directly (the view reads `modelGateway.name` instead).
// `strategy` is the wire-level LoadBalancingStrategy the resolver POSTs
// in router_settings; no separate "uiStrategy" abstraction anymore.

const MODEL_ROUTE_FIELDS = gql`
  fragment ModelRouteFields on ModelRoute {
    id
    name
    modelGateway {
      id
      name
    }
    supportedModels
    strategy
    fallbacks
    contextWindowFallbacks
    contentPolicyFallbacks
    createdAt
    updatedAt
  }
`

export const MODEL_ROUTES_QUERY = gql`
  query ModelRoutes {
    modelRoutes {
      ...ModelRouteFields
    }
  }
  ${MODEL_ROUTE_FIELDS}
`

export const CREATE_MODEL_ROUTE = gql`
  mutation CreateModelRoute($input: CreateModelRouteInput!) {
    createModelRoute(input: $input) {
      ...ModelRouteFields
    }
  }
  ${MODEL_ROUTE_FIELDS}
`

export const UPDATE_MODEL_ROUTE = gql`
  mutation UpdateModelRoute($id: ID!, $input: UpdateModelRouteInput!) {
    updateModelRoute(id: $id, input: $input) {
      ...ModelRouteFields
    }
  }
  ${MODEL_ROUTE_FIELDS}
`

export const DELETE_MODEL_ROUTE = gql`
  mutation DeleteModelRoute($id: ID!) {
    deleteModelRoute(id: $id)
  }
`

// syncRouterSettings — atomic 全量聚合覆盖刷新 (design doc §3.2).
// Re-aggregates every active ModelRoute + RouterTier and POSTs the full
// router_settings payload to /config/update. The route-save resolver hooks
// fire this automatically; this mutation is exposed so the console can
// call it explicitly (e.g. "Sync Now" button after manual edits or a
// transient /config/update failure recovery).
export const SYNC_ROUTER_SETTINGS = gql`
  mutation SyncRouterSettings {
    syncRouterSettings
  }
`

// LoadBalancingStrategy — LiteLLM's wire-level routing strategy (kebab-case
// on the wire; rendered UPPER_SNAKE on this side by the GraphQL enum).
// Mapped to kebab-case in internal/gateway.ToLitellmRoutingStrategy when
// the resolver POSTs /config/update. The previous ModelRouteStrategy
// (ROUND_ROBIN / WEIGHTED_ROUND_ROBIN / RANDOM) console-level abstraction
// was removed; LoadBalancingStrategy is the only strategy field on a route.
export type LoadBalancingStrategy =
  | 'SIMPLE_SHUFFLE'
  | 'LEAST_BUSY'
  | 'LATENCY_BASED_ROUTING'
  | 'USAGE_BASED_ROUTING_V2'
  | 'COST_BASED_ROUTING'

export const LOAD_BALANCING_STRATEGIES: LoadBalancingStrategy[] = [
  'SIMPLE_SHUFFLE',
  'LEAST_BUSY',
  'LATENCY_BASED_ROUTING',
  'USAGE_BASED_ROUTING_V2',
  'COST_BASED_ROUTING',
]

export interface ModelRouteNode {
  id: string
  name: string
  // Resolved gateway row (non-null on the schema). The console-side
  // shape is just { id, name } — matches what callers need to render
  // the row and to send back as `modelGatewayId` on update.
  modelGateway: { id: string; name: string }
  supportedModels: string[]
  strategy: LoadBalancingStrategy
  // Fallback chains surfaced to litellm via /config/update (design doc §3.2).
  // Each list is an ordered set of model_aliases (other routes' names).
  fallbacks: string[]
  contextWindowFallbacks: string[]
  contentPolicyFallbacks: string[]
  createdAt: string
  updatedAt: string
}

export interface ModelRoutesResult {
  modelRoutes: ModelRouteNode[]
}

// CreateModelRouteInput wire shape — `modelGatewayId` is REQUIRED on
// create; the backend rejects a route that has no gateway to host on.
// `gatewayName` is gone (the resolver resolves the gateway by id; the
// previous denormalized string dropped with it).
export interface CreateModelRouteInputVars {
  name: string
  modelGatewayId: string
  supportedModels: string[]
  strategy?: LoadBalancingStrategy | null
  fallbacks?: string[] | null
  contextWindowFallbacks?: string[] | null
  contentPolicyFallbacks?: string[] | null
}

export interface CreateModelRouteVars {
  input: CreateModelRouteInputVars
}

export interface CreateModelRouteResult {
  createModelRoute: ModelRouteNode
}

// UpdateModelRouteInput wire shape — every field optional, partial
// updates only. `modelGatewayId` is still validated against live
// gateways when present.
export interface UpdateModelRouteInputVars {
  name?: string | null
  modelGatewayId?: string | null
  supportedModels?: string[] | null
  strategy?: LoadBalancingStrategy | null
  fallbacks?: string[] | null
  contextWindowFallbacks?: string[] | null
  contentPolicyFallbacks?: string[] | null
}

export interface UpdateModelRouteVars {
  id: string
  input: UpdateModelRouteInputVars
}

export interface UpdateModelRouteResult {
  updateModelRoute: ModelRouteNode
}

export interface DeleteModelRouteVars {
  id: string
}

export interface DeleteModelRouteResult {
  deleteModelRoute: boolean
}

export interface SyncRouterSettingsResult {
  syncRouterSettings: boolean
}
