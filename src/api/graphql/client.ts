import {
  ApolloClient,
  InMemoryCache,
  ApolloLink,
  HttpLink,
  Observable,
  type FetchResult,
  type Operation,
} from '@apollo/client/core'
import { setContext } from '@apollo/client/link/context'
import { agentsFixture } from './fixtures/agents'

/**
 * Fixture link — intercepts the `Agents` query and returns local data with a
 * simulated 250ms latency. Real network calls fall through to the HTTP link,
 * but the agent-platform-backend isn't reachable yet so we short-circuit.
 *
 * To wire the real backend:
 *   1. Remove `fixtureLink` from the chain below.
 *   2. Set VITE_GRAPHQL_ENDPOINT to the backend URL.
 *   3. Keep `authLink` if you need to attach auth headers.
 *
 * Implementation note: we accept a `forward` argument and call it for the
 * non-Agents path. This keeps the link non-terminating in Apollo's eyes, which
 * silences the "concat on a terminating link" warning emitted by `ApolloLink.from`.
 */
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
    return forward ? forward(operation) : null
  },
)

const httpLink = new HttpLink({
  uri:
    (import.meta.env.VITE_GRAPHQL_ENDPOINT as string | undefined) ??
    '/graphql',
})

const authLink = setContext((_op, { headers }) => {
  let token: string | null = null
  try {
    token = localStorage.getItem('clarity-auth-token')
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

/**
 * Single Apollo Client instance for the app. Order matters: ApolloLink chain
 * executes left-to-right, so the fixture link takes precedence over HTTP.
 */
export const apolloClient = new ApolloClient({
  link: ApolloLink.from([fixtureLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})