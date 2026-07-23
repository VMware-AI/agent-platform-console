import { gql } from '@apollo/client/core'

// Provider Models (供应商模型 / LiteLLM). Source of truth: the Postman
// collection at postman/agent-platform-backend.postman_collection.json
// folder "Provider Models", requests R1..R10.
//
// One ProviderModel row (a `model_name` group in litellm) contains N
// `modelSpecs` (one per litellm deployment). The API splits CRUD into
//   - row-level:        createProviderModel(R2) / updateProviderModel(R3) / deleteProviderModel(R4)
//   - spec-level:       addProviderModelSpec(R5) / updateProviderModelSpec(R6) /
//                       deleteProviderModelSpec(R7) / blockProviderModelSpec(R8)
//   - probe / refresh:  testProviderConnection(R9) / refreshProviderModelStatus(R10)
//
// `updateProviderModel` is full-replace (the resolver writes the
// complete spec list as one idempotent transaction; absent specs are
// deleted). Edit-mode callers MUST re-send every spec they want to
// keep, including `modelInfo.id`.

const PROVIDER_MODEL_FIELDS = gql`
  fragment ProviderModelFields on ProviderModel {
    id
    name
    status
    lastCheckedAt
    createdAt
    updatedAt
    modelGateway {
      id
      name
      provider
      endpoint
    }
    modelSpecs {
      litellmParams {
        apiKeyRef
        apiBase
        model
        customLlmProvider
        organization
        tpm
        rpm
        maxBudget
        budgetDuration
        useInPassThrough
        useChatCompletionsApi
        mergeReasoningContentInChoices
        tags
        inputCostPerToken
        outputCostPerToken
        cacheReadInputTokenCost
        cacheCreationInputTokenCost
      }
      modelInfo {
        id
        mode
        blocked
        additionalProp1 {
          status
          message
        }
      }
    }
  }
`

export const PROVIDER_MODELS_QUERY = gql`
  query ProviderModelInfo(
    $filter: ProviderModelInfoFilterInput
    $page: PageInput!
    $sort: ProviderModelInfoSort
  ) {
    providerModelInfo(filter: $filter, page: $page, sort: $sort) {
      data {
        ...ProviderModelFields
      }
      total_count
      current_page
      total_pages
      size
    }
  }
  ${PROVIDER_MODEL_FIELDS}
`

export const CREATE_PROVIDER_MODEL = gql`
  mutation CreateProviderModel($input: CreateProviderModelInput!) {
    createProviderModel(input: $input) {
      ...ProviderModelFields
    }
  }
  ${PROVIDER_MODEL_FIELDS}
`

export const UPDATE_PROVIDER_MODEL = gql`
  mutation UpdateProviderModel($input: UpdateProviderModelInput!) {
    updateProviderModel(input: $input) {
      ...ProviderModelFields
    }
  }
  ${PROVIDER_MODEL_FIELDS}
`

export const DELETE_PROVIDER_MODEL = gql`
  mutation DeleteProviderModel($id: ID!) {
    deleteProviderModel(id: $id)
  }
`

export const ADD_PROVIDER_MODEL_SPEC = gql`
  mutation AddProviderModelSpec($input: AddProviderModelSpecInput!) {
    addProviderModelSpec(input: $input) {
      id
      name
      status
      modelSpecs {
        litellmParams {
          apiKeyRef
          apiBase
          model
          customLlmProvider
          organization
          tpm
          rpm
          maxBudget
          budgetDuration
          useInPassThrough
          useChatCompletionsApi
          mergeReasoningContentInChoices
          tags
          inputCostPerToken
          outputCostPerToken
          cacheReadInputTokenCost
          cacheCreationInputTokenCost
        }
        modelInfo {
          id
          mode
          blocked
          additionalProp1 {
            status
            message
          }
        }
      }
    }
  }
`

export const UPDATE_PROVIDER_MODEL_SPEC = gql`
  mutation UpdateProviderModelSpec($input: UpdateProviderModelSpecInput!) {
    updateProviderModelSpec(input: $input) {
      id
      name
      status
      modelSpecs {
        litellmParams {
          apiKeyRef
          apiBase
          model
          customLlmProvider
          organization
          tpm
          rpm
          maxBudget
          budgetDuration
          useInPassThrough
          useChatCompletionsApi
          mergeReasoningContentInChoices
          tags
          inputCostPerToken
          outputCostPerToken
          cacheReadInputTokenCost
          cacheCreationInputTokenCost
        }
        modelInfo {
          id
          mode
          blocked
          additionalProp1 {
            status
            message
          }
        }
      }
    }
  }
`

export const DELETE_PROVIDER_MODEL_SPEC = gql`
  mutation DeleteProviderModelSpec($input: ProviderModelSpecIdInput!) {
    deleteProviderModelSpec(input: $input) {
      id
      name
      status
      modelSpecs {
        modelInfo {
          id
          mode
          blocked
          additionalProp1 {
            status
            message
          }
        }
        litellmParams {
          model
          apiBase
          customLlmProvider
        }
      }
    }
  }
`

export const BLOCK_PROVIDER_MODEL_SPEC = gql`
  mutation BlockProviderModelSpec($input: ProviderModelSpecBlockInput!) {
    blockProviderModelSpec(input: $input) {
      id
      name
      status
      modelSpecs {
        modelInfo {
          id
          mode
          blocked
          additionalProp1 {
            status
            message
          }
        }
        litellmParams {
          model
          apiBase
          customLlmProvider
        }
      }
    }
  }
`

export const TEST_PROVIDER_CONNECTION = gql`
  mutation TestProviderConnection($name: String!) {
    testProviderConnection(name: $name)
  }
`

// Per-spec upstream probe. Talks to the upstream LLM provider with the
// spec's apiBase + apiKey (both plaintext on the wire, never persisted
// by the resolver — see deploy/result_k9nGw6.md) and returns the
// upstream /v1/models list so the user can pick a real model name
// instead of typing blindly.
export const TEST_PRIVATE_MODEL_SPEC_CONNECTION = gql`
  mutation TestPrivateModelSpecConnection($input: TestPrivateModelSpecConnectionInput!) {
    testPrivateModelSpecConnection(input: $input) {
      success
      message
      modelList
      testedAt
    }
  }
`

export const REFRESH_PROVIDER_MODEL_STATUS = gql`
  mutation RefreshProviderModelStatus($id: ID!) {
    refreshProviderModelStatus(id: $id) {
      id
      name
      status
      lastCheckedAt
      updatedAt
      modelSpecs {
        modelInfo {
          id
          mode
          blocked
          additionalProp1 {
            status
            message
          }
        }
        litellmParams {
          model
          apiBase
          customLlmProvider
        }
      }
    }
  }
`

// ─── Enums ─────────────────────────────────────────────────────────────────

export type ProviderModelStatus =
  | 'full_healthy'
  | 'partial_outage'
  | 'full_outage'
  | 'unknown'

export type ProviderModelSortField = 'NAME' | 'STATUS' | 'GATEWAY'
export type SortDirection = 'ASC' | 'DESC'
export const SORT_DIRECTIONS: SortDirection[] = ['ASC', 'DESC']

// ─── Common input shapes ──────────────────────────────────────────────────

export interface PageInput {
  limit: number
  offset: number
}

export interface ProviderModelInfoFilterInput {
  search?: string | null
  status?: ProviderModelStatus | null
  // Wire name from the GraphQL schema: `modelGatewayId` matches the
  // ProviderModel modelGateway foreign-key on the backend. The local
  // symbol is exported as-is so a future schema rename is a one-line
  // change here.
  modelGatewayId?: string | null
}

export interface ProviderModelInfoSort {
  field: ProviderModelSortField
  direction: SortDirection
}

// ─── Read shapes ──────────────────────────────────────────────────────────

export interface AdditionalProp1 {
  status: string
  message: string | null
}

export interface LitellmParams {
  apiKeyRef: string | null
  apiBase: string | null
  model: string
  customLlmProvider: string
  organization: string | null
  tpm: number | null
  rpm: number | null
  maxBudget: number | null
  budgetDuration: string | null
  useInPassThrough: boolean
  useChatCompletionsApi: boolean
  mergeReasoningContentInChoices: boolean
  tags: string[]
  inputCostPerToken: number | null
  outputCostPerToken: number | null
  cacheReadInputTokenCost: number | null
  cacheCreationInputTokenCost: number | null
  defaultApiKeyTpmLimit: number | null
  defaultApiKeyRpmLimit: number | null
}

export interface ModelInfo {
  id: string
  mode: string | null
  blocked: boolean
  additionalProp1: AdditionalProp1
}

export interface ModelSpec {
  litellmParams: LitellmParams
  modelInfo: ModelInfo
}

export interface ProviderModelNode {
  id: string
  name: string
  status: ProviderModelStatus
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
  modelGateway: { id: string; name: string; provider: string; endpoint: string }
  modelSpecs: ModelSpec[]
}

export interface ProviderModelInfoConnection {
  data: ProviderModelNode[]
  total_count: number
  current_page: number
  total_pages: number
  size: number
}

export interface ProviderModelInfoResult {
  providerModelInfo: ProviderModelInfoConnection
}

// ─── Write / input shapes ─────────────────────────────────────────────────

export interface LitellmParamsInput {
  apiKey?: string | null
  apiBase?: string | null
  model: string
  customLlmProvider: string
  organization?: string | null
  tpm?: number | null
  rpm?: number | null
  maxBudget?: number | null
  budgetDuration?: string | null
  useInPassThrough?: boolean | null
  useChatCompletionsApi?: boolean | null
  mergeReasoningContentInChoices?: boolean | null
  tags?: string[] | null
  inputCostPerToken?: number | null
  outputCostPerToken?: number | null
  cacheReadInputTokenCost?: number | null
  cacheCreationInputTokenCost?: number | null
  // Per-spec API key default limits. Backend dropped the row-level
  // CreateProviderModelInput.defaultApiKey{Tpm,Rpm}Limit fields and now
  // expects both limits to be carried on every spec's litellmParams so
  // each deployment can declare its own defaults.
  defaultApiKeyTpmLimit?: number | null
  defaultApiKeyRpmLimit?: number | null
}

export interface ModelInfoInput {
  id?: string | null
  mode?: string | null
  blocked?: boolean | null
}

export interface ModelSpecInput {
  litellmParams: LitellmParamsInput
  modelInfo?: ModelInfoInput | null
}

export interface CreateProviderModelInput {
  name: string
  modelGateway: string
  modelSpecs: ModelSpecInput[]
}

export interface UpdateProviderModelInput {
  providerModelId: string
  modelSpecs: ModelSpecInput[]
}

export interface AddProviderModelSpecInput {
  providerModelId: string
  spec: ModelSpecInput
}

export interface UpdateProviderModelSpecInput {
  specId: string
  litellmParams: LitellmParamsInput
  modelInfo?: ModelInfoInput | null
}

export interface ProviderModelSpecIdInput {
  specId: string
}

export interface ProviderModelSpecBlockInput {
  specId: string
  blocked: boolean
}

// ─── Vars / Result pairs (one per mutation) ───────────────────────────────

export interface CreateProviderModelVars {
  input: CreateProviderModelInput
}
export interface CreateProviderModelResult {
  createProviderModel: ProviderModelNode
}
export interface UpdateProviderModelVars {
  input: UpdateProviderModelInput
}
export interface UpdateProviderModelResult {
  updateProviderModel: ProviderModelNode
}
export interface DeleteProviderModelVars {
  id: string
}
export interface DeleteProviderModelResult {
  deleteProviderModel: boolean
}
export interface AddProviderModelSpecVars {
  input: AddProviderModelSpecInput
}
export interface AddProviderModelSpecResult {
  addProviderModelSpec: ProviderModelNode
}
export interface UpdateProviderModelSpecVars {
  input: UpdateProviderModelSpecInput
}
export interface UpdateProviderModelSpecResult {
  updateProviderModelSpec: ProviderModelNode
}
export interface DeleteProviderModelSpecVars {
  input: ProviderModelSpecIdInput
}
export interface DeleteProviderModelSpecResult {
  deleteProviderModelSpec: ProviderModelNode
}
export interface BlockProviderModelSpecVars {
  input: ProviderModelSpecBlockInput
}
export interface BlockProviderModelSpecResult {
  blockProviderModelSpec: ProviderModelNode
}
export interface TestProviderConnectionVars {
  name: string
}
export interface TestProviderConnectionResult {
  testProviderConnection: ProviderModelStatus
}
export interface PrivateModelSpecTestResult {
  success: boolean
  message: string
  modelList: string[]
  testedAt: string
}
export interface TestPrivateModelSpecConnectionInput {
  apiBase: string
  apiKey: string
  customLlmProvider?: string | null
}
export interface TestPrivateModelSpecConnectionVars {
  input: TestPrivateModelSpecConnectionInput
}
export interface TestPrivateModelSpecConnectionResult {
  testPrivateModelSpecConnection: PrivateModelSpecTestResult
}
export interface RefreshProviderModelStatusVars {
  id: string
}
export interface RefreshProviderModelStatusResult {
  refreshProviderModelStatus: ProviderModelNode
}
