export interface ModelRoute {
  id: string
  name: string
  gatewayId: string
  gatewayName: string
  strategy: string
  supportedModels: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ModelRouteDraft {
  name: string
  gatewayId: string
  gatewayName: string
  strategy: string
  supportedModels: string[]
  enabled: boolean
}

export interface ModelRouteGatewayOption {
  id: string
  name: string
}

// ModelRouteStrategy — previously a ROUND_ROBIN / WEIGHTED_ROUND_ROBIN / RANDOM
// console-level abstraction (the "uiStrategy" / 控制台策略 field) kept here
// and imported by ModelRouteFormModal / ModelRouteView. Removed alongside the
// uiStrategy field on the GraphQL ModelRoute. The only strategy surface
// remaining is LoadBalancingStrategy in
// src/api/graphql/queries/model-routes.ts. ModelRoute / ModelRouteDraft are
// unused at the moment; their `strategy` field is widened to `string` so
// the file compiles without the deleted alias.
