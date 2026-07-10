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

export type ProviderModelSortField = 'NAME' | 'STATUS' | 'GATEWAY'

export const PROVIDER_MODEL_SORT_FIELDS: ProviderModelSortField[] = ['NAME', 'STATUS', 'GATEWAY']

// Node / model-name regex — wire constraint: uppercase OR lowercase letters,
// digits, hyphens, and dots. Reused by the form's inline validation.
// (Was historically upper-only; the new ProviderModel API accepts case-mixed
// names like `gpt-4o-mini` and `DeepSeek-V3.1`.)
export const MODEL_NAME_PATTERN = /^[A-Za-z0-9.-]+$/
export const MODEL_NAME_PATTERN_HINT = 'supplier.model.nodeId.hint' // i18n key

// Predefined LLM providers selectable in the supplier-model form.
// `custom` is the "user-typed arbitrary string" branch — when picked, the
// form shows a free-text input and disables the apiBase auto-fill.
export const PROVIDER_OPTIONS = [
  'custom',
  'deepseek',
  'minimax',
  'moonshot',
  'openrouter',
  'openai',
  'anthropic',
] as const

export type ProviderOption = (typeof PROVIDER_OPTIONS)[number]

// Default apiBase per predefined provider. Mirrors LiteLLM's known defaults
// at the time of writing; users can still override in the form.
export const PROVIDER_DEFAULT_API_BASE: Record<ProviderOption, string> = {
  custom: '',
  deepseek: 'https://api.deepseek.com/v1',
  minimax: 'https://api.minimaxi.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
}

// Sentinel value for the "user typed a custom provider" branch. Mirrors
// the MODE_CUSTOM pattern in SupplierModelFormModal — see that file.
export const PROVIDER_CUSTOM = '__custom__'