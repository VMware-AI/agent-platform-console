export type ModelRouteStrategy = 'ROUND_ROBIN' | 'WEIGHTED_ROUND_ROBIN' | 'RANDOM'

export interface ModelRoute {
  id: string
  name: string
  gatewayId: string
  gatewayName: string
  strategy: ModelRouteStrategy
  supportedModels: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ModelRouteDraft {
  name: string
  gatewayId: string
  gatewayName: string
  strategy: ModelRouteStrategy
  supportedModels: string[]
  enabled: boolean
}

export interface ModelRouteGatewayOption {
  id: string
  name: string
}

export const MODEL_ROUTE_STRATEGIES: ModelRouteStrategy[] = [
  'ROUND_ROBIN',
  'WEIGHTED_ROUND_ROBIN',
  'RANDOM',
]
