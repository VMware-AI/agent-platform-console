import { gql } from '@apollo/client/core'

// Upstream health per gateway (LLD-15 T4). The backend fans out to each gateway's
// litellm GET /health; the console renders a health matrix. A single unreachable
// gateway comes back reachable=false with an error rather than failing the query.

export const GATEWAY_HEALTH_QUERY = gql`
  query GatewayHealth {
    gatewayHealth {
      gatewayId
      gatewayName
      reachable
      healthyCount
      unhealthyCount
      healthy {
        model
        apiBase
      }
      unhealthy {
        model
        apiBase
      }
      error
    }
  }
`

export interface EndpointHealth {
  model: string
  apiBase: string | null
}

export interface GatewayHealth {
  gatewayId: string
  gatewayName: string
  reachable: boolean
  healthyCount: number
  unhealthyCount: number
  healthy: EndpointHealth[]
  unhealthy: EndpointHealth[]
  error: string | null
}

export interface GatewayHealthResult {
  gatewayHealth: GatewayHealth[]
}
