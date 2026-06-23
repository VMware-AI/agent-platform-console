import {
  ApolloClient,
  InMemoryCache,
  ApolloLink,
  HttpLink,
} from '@apollo/client/core'
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
 *   1. `schemaLink` — executes queries against the in-memory GraphQL schema
 *      defined in `schema.graphql.ts`. This is where Agents / Users / Roles
 *      queries + the 6 user-management mutations are served. Zero network
 *      hops — the resolvers live in `resolvers.ts` and read/write the
 *      module-level fixture stores in `fixtures/*`.
 *   2. `authLink`   — attaches the Bearer token from localStorage so the
 *      shape of future real-network calls matches today's mock.
 *   3. `httpLink`   — kept as a fallback / future real-backend target.
 *      Currently nothing should reach it because `schemaLink` is
 *      terminating; it's wired in so flipping to a real backend is a
 *      one-line change (drop `schemaLink`).
 */

const schema = buildSchema(typeDefs)

const schemaLink = new SchemaLink({
  schema,
  rootValue,
  validate: true,
})

const fixtureLink = new ApolloLink(
  (operation: Operation, forward?: (op: Operation) => ReturnType<ApolloLink['request']>) => {
    if (operation.operationName === 'Agents') {
      return new Observable<FetchResult>((observer) => {
        const handle = setTimeout(() => {
          observer.next({ data: agentsFixture(operation.variables as never) })
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
                  data = modelGatewaysFixture(operation.variables as ModelGatewaysQueryVars)
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
    return forward ? forward(operation) : null
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
  link: ApolloLink.from([schemaLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})
