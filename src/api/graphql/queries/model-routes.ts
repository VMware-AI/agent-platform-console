import { gql } from '@apollo/client/core'

// Model routes (模型路由). A route maps an outward name to a set of supported
// models served by a backend gateway, load-balanced by a console-facing strategy
// (ROUND_ROBIN / WEIGHTED_ROUND_ROBIN / RANDOM). The view shows gatewayName per
// row, so it is denormalized onto the route. createModelRoute mints a new route by
// id; updateModelRoute edits one by id; setModelRouteEnabled / deleteModelRoute
// match the row + batch actions. `uiStrategy` is the friendly strategy enum
// (distinct from the litellm `strategy`); `supportedModels` aliases the route's
// upstream model group.

const MODEL_ROUTE_FIELDS = gql`
  fragment ModelRouteFields on ModelRoute {
    id
    name
    backendGatewayId
    gatewayName
    supportedModels
    strategy
    uiStrategy
    enabled
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

export const SET_MODEL_ROUTE_ENABLED = gql`
  mutation SetModelRouteEnabled($id: ID!, $enabled: Boolean!) {
    setModelRouteEnabled(id: $id, enabled: $enabled) {
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
// Distinct from `uiStrategy` (the friendly, gateway-agnostic console
// strategy). Mapped to kebab-case in internal/gateway.ToLitellmRoutingStrategy
// when the resolver POSTs /config/update.
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

export type ModelRouteStrategy = 'ROUND_ROBIN' | 'WEIGHTED_ROUND_ROBIN' | 'RANDOM'

export interface ModelRouteNode {
  id: string
  name: string
  backendGatewayId: string | null
  gatewayName: string
  supportedModels: string[]
  strategy: LoadBalancingStrategy
  uiStrategy: ModelRouteStrategy
  enabled: boolean
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

export interface CreateModelRouteInputVars {
  name: string
  backendGatewayId?: string | null
  gatewayName?: string | null
  supportedModels?: string[] | null
  uiStrategy?: ModelRouteStrategy | null
  enabled?: boolean | null
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

export interface UpdateModelRouteInputVars {
  name?: string | null
  backendGatewayId?: string | null
  gatewayName?: string | null
  supportedModels?: string[] | null
  uiStrategy?: ModelRouteStrategy | null
  enabled?: boolean | null
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

export interface SetModelRouteEnabledVars {
  id: string
  enabled: boolean
}

export interface SetModelRouteEnabledResult {
  setModelRouteEnabled: ModelRouteNode
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
