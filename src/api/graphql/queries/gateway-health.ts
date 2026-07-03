import { gql } from '@apollo/client/core'

// Upstream health per gateway (LLD-15 T4). The backend fans out to each gateway's
// litellm GET /health; the console renders a health matrix. A single unreachable
// gateway comes back with an `error` string rather than failing the whole query.

export const GATEWAY_HEALTH_QUERY = gql`
  query GatewayHealth {
    gatewayHealth {
      gatewayId
      gatewayName
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
  healthyCount: number
  unhealthyCount: number
  healthy: EndpointHealth[]
  unhealthy: EndpointHealth[]
  error: string | null
}

export interface GatewayHealthResult {
  gatewayHealth: GatewayHealth[]
}
