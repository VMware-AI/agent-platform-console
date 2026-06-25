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
    uiStrategy
    enabled
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

export type ModelRouteStrategy = 'ROUND_ROBIN' | 'WEIGHTED_ROUND_ROBIN' | 'RANDOM'

export interface ModelRouteNode {
  id: string
  name: string
  backendGatewayId: string | null
  gatewayName: string
  supportedModels: string[]
  uiStrategy: ModelRouteStrategy
  enabled: boolean
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
