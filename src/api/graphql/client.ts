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

export const apolloClient = new ApolloClient({
  link: ApolloLink.from([schemaLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})