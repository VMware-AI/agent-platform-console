// ProviderModel (供应商模型) — physical node / upstream LLM provider.
// Pure constants only. The canonical TypeScript shape for the
// ProviderModel entity lives in `@/api/graphql/queries/supplier-models.ts`
// (matches the GraphQL fragment — same pattern as `model-gateway.ts`).
//
// This file is a leaf: it does not import from the query module (no
// `@apollo/client` dependency), so view / form / drawer can import
// constants from here without pulling `gql` into their context.

export type ProviderModelStatus =
  | 'full_healthy'
  | 'partial_outage'
  | 'full_outage'
  | 'unknown'

export const PROVIDER_MODEL_STATUSES: ProviderModelStatus[] = [
  'full_healthy',
  'partial_outage',
  'full_outage',
  'unknown',
]

export type ProviderModelSortField = 'NAME' | 'STATUS'

export const PROVIDER_MODEL_SORT_FIELDS: ProviderModelSortField[] = ['NAME', 'STATUS']

// Node ID regex — design doc §2.1: "Node ID 必须限制为纯大写字母、数字和中划线".
// Reused by the form's inline validation.
export const NODE_ID_PATTERN = /^[A-Z0-9-]+$/
export const NODE_ID_PATTERN_HINT = 'supplier.model.nodeId.hint' // i18n key