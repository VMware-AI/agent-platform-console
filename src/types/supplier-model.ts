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

// Node / model-name regex — wire constraint: uppercase OR lowercase letters,
// digits, hyphens, and dots. Reused by the form's inline validation.
// (Was historically upper-only; the new ProviderModel API accepts case-mixed
// names like `gpt-4o-mini` and `DeepSeek-V3.1`.)
export const MODEL_NAME_PATTERN = /^[A-Za-z0-9.-]+$/
export const MODEL_NAME_PATTERN_HINT = 'supplier.model.nodeId.hint' // i18n key