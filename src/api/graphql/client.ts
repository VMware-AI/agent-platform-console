import {
  ApolloClient,
  InMemoryCache,
  ApolloLink,
  HttpLink,
  Observable,
  type FetchResult,
} from '@apollo/client/core'
import type { Operation } from '@apollo/client/link/core/types'
import { setContext } from '@apollo/client/link/context'
import { SchemaLink } from '@apollo/client/link/schema'
import { buildSchema } from 'graphql'
import { typeDefs } from './schema.graphql'
import { rootValue } from './resolvers'
import { agentsFixture } from './fixtures/agents'
import {
  createModelGatewayFixture,
  deleteModelGatewayFixture,
  modelGatewaysFixture,
  testModelGatewayConnectionFixture,
  updateModelGatewayFixture,
} from './fixtures/model-gateways'
import type {
  CreateModelGatewayVars,
  DeleteModelGatewayVars,
  ModelGatewaysQueryVars,
  TestModelGatewayConnectionVars,
  UpdateModelGatewayVars,
} from './model-gateway-types'

const gatewayFixtureEnabled = import.meta.env.VITE_MODEL_GATEWAY_DATA_MODE === 'fixture'


/**
 * Single Apollo Client instance for the app.
 *
 * Link chain (left-to-right):
 *   1. `fixtureLink` — short-circuits the in-memory `Agents` query and the
 *      5 `ModelGateways*` operations to their fixture implementations in
 *      `fixtures/*`, bypassing the GraphQL schema entirely. This avoids the
 *      modelGateways type definitions (which are not in `schema.graphql.ts`)
 *      hitting SchemaLink's `validate: true` step.
 *   2. `schemaLink`  — executes every other query against the in-memory
 *      GraphQL schema. Agents / Users / Roles / Resource Pools / 6 user
 *      mutations are served here from the resolver functions in
 *      `resolvers.ts`, which read/write the same module-level fixture stores.
 *   3. `authLink`    — attaches the Bearer token from localStorage so the
 *      shape of future real-network calls matches today's mock.
 *   4. `httpLink`    — kept as a fallback / future real-backend target.
 *      Nothing should reach it today.
 */

const schema = buildSchema(typeDefs)

const schemaLink = new SchemaLink({
  schema,
  rootValue,
  validate: true,
})

const fixtureLink = new ApolloLink((operation: Operation) => {
  if (operation.operationName === 'Agents') {
      return new Observable<FetchResult>((observer) => {
        const handle = setTimeout(() => {
          const connection = agentsFixture(operation.variables as never)
          observer.next({
            data: {
              agents: {
                __typename: 'AgentConnection',
                ...connection,
              },
            },
          })
          observer.complete()
        }, 250)
        return () => clearTimeout(handle)
      })
    }

    if (
      gatewayFixtureEnabled &&
      [
        'ModelGateways',
        'CreateModelGateway',
        'UpdateModelGateway',
        'DeleteModelGateway',
        'TestModelGatewayConnection',
      ].includes(operation.operationName)
    ) {
      return new Observable<FetchResult>((observer) => {
        const handle = setTimeout(
          () => {
            try {
              let data: FetchResult['data']
              switch (operation.operationName) {
                case 'ModelGateways':
                  {
                    const fixtureResult = modelGatewaysFixture(operation.variables as ModelGatewaysQueryVars)
                    data = {
                      modelGateways: {
                        __typename: 'ModelGatewayConnection',
                        ...fixtureResult.modelGateways,
                      },
                      modelGatewaySyncSummary: {
                        __typename: 'ModelGatewaySyncSummary',
                        ...fixtureResult.modelGatewaySyncSummary,
                      },
                    }
                  }
                  break
                case 'CreateModelGateway':
                  data = createModelGatewayFixture(operation.variables as CreateModelGatewayVars)
                  break
                case 'UpdateModelGateway':
                  data = updateModelGatewayFixture(operation.variables as UpdateModelGatewayVars)
                  break
                case 'DeleteModelGateway':
                  data = deleteModelGatewayFixture(operation.variables as DeleteModelGatewayVars)
                  break
                case 'TestModelGatewayConnection':
                  data = testModelGatewayConnectionFixture(
                    operation.variables as TestModelGatewayConnectionVars,
                  )
                  break
              }
              observer.next({ data })
              observer.complete()
            } catch (error) {
              observer.error(error)
            }
          },
          operation.operationName === 'ModelGateways' ? 250 : 450,
        )
        return () => clearTimeout(handle)
      })
    }
    return null
  },
)


const httpLink = new HttpLink({
  uri: (import.meta.env.VITE_GRAPHQL_ENDPOINT as string | undefined) ?? '/graphql',
})

const authLink = setContext((_op, { headers }) => {
  let token: string | null = null
  try {
    token = localStorage.getItem('clarity-auth-token')
    if (!token) token = sessionStorage.getItem('clarity-auth-token')
  } catch {
    /* ignore — SSR / locked storage */
  }
  return {
    headers: {
      ...(headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }
})

export const apolloClient = new ApolloClient({
  // `SchemaLink` is a terminating link — `ApolloLink.from([...terminating, ...])`
  // silently no-ops the tail via `concat`. So we use `split` to send
  // fixture-handled operations to `fixtureLink` and everything else to
  // `schemaLink` (which is the only one that actually needs the trailing
  // `authLink` + `httpLink` chain — and even then, those are no-ops today
  // because `schemaLink` never calls `forward`).
  link: ApolloLink.split(
    (operation) => {
      if (operation.operationName === 'Agents') return true
      if (
        gatewayFixtureEnabled &&
        [
          'ModelGateways',
          'CreateModelGateway',
          'UpdateModelGateway',
          'DeleteModelGateway',
          'TestModelGatewayConnection',
        ].includes(operation.operationName ?? '')
      ) {
        return true
      }
      return false
    },
    fixtureLink,
    schemaLink,
  ),
  cache: new InMemoryCache({
    // Without `keyFields`, the InMemoryCache cannot identify entities by
    // `__typename` + `id`, so it falls back to writing them inline in the
    // parent field — and when an inline object's children are themselves
    // `__typename`-tagged entities (e.g. `Agent.apiKey` → `AgentApiKey`),
    // those children get stripped, triggering "Missing field" warnings and
    // (more importantly) breaking Vue computeds that read through the
    // missing field. Declaring `id` as the key for every entity type the
    // fixtures return is enough to let the cache normalize correctly.
    typePolicies: {
      Agent: { keyFields: ['id'] },
      AgentApiKey: { keyFields: ['id'] },
      User: { keyFields: ['id'] },
      ModelGateway: { keyFields: ['id'] },
      ResourcePool: { keyFields: ['id'] },
      AccountUser: { keyFields: ['id'] },
      Role: { keyFields: ['id'] },
    },
  }),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})
