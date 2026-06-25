import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client/core'
import { setContext } from '@apollo/client/link/context'

/**
 * Single Apollo Client for the app, wired to the real agent-platform-backend.
 *
 * Transport: HTTP POST to `VITE_GRAPHQL_ENDPOINT` (default same-origin `/query`).
 * Auth: Bearer token. `login` returns `AuthPayload.token` (= the session id);
 * the auth store persists it (see `stores/auth.ts`) and `authLink` attaches it
 * as `Authorization: Bearer <token>` on every request. `me` rehydrates the
 * session on reload; `logout` invalidates it server-side.
 */

// Storage key for the session token. The auth store is the only writer; the
// transport (`authLink` below) is the only reader.
export const TOKEN_STORAGE_KEY = 'clarity-auth-token'

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? sessionStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    // SSR / locked or unavailable storage — proceed unauthenticated.
    return null
  }
}

const httpLink = new HttpLink({
  uri: (import.meta.env.VITE_GRAPHQL_ENDPOINT as string | undefined) ?? '/query',
})

const authLink = setContext((_operation, { headers }) => {
  const token = readToken()
  return {
    headers: {
      ...(headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }
})

export const apolloClient = new ApolloClient({
  link: ApolloLink.from([authLink, httpLink]),
  cache: new InMemoryCache({
    // Normalize every entity the backend returns by `__typename` + `id` so the
    // cache can dedupe and patch mutation results in place. The default cache
    // already keys on `id`; listing the entity types documents the set and
    // guards against a stray `id`-less type being written inline.
    typePolicies: {
      Agent: { keyFields: ['id'] },
      AgentApiKey: { keyFields: ['id'] },
      User: { keyFields: ['id'] },
      AccountUser: { keyFields: ['id'] },
      ModelGateway: { keyFields: ['id'] },
      ResourcePool: { keyFields: ['id'] },
      Role: { keyFields: ['id'] },
      VirtualKey: { keyFields: ['id'] },
      RateLimitPolicy: { keyFields: ['id'] },
      OvaTemplateFamily: { keyFields: ['id'] },
      OvaTemplateVersion: { keyFields: ['id'] },
      RequestLog: { keyFields: ['id'] },
      AuditLog: { keyFields: ['id'] },
      AgentConfig: { keyFields: ['id'] },
      Artifact: { keyFields: ['id'] },
      Department: { keyFields: ['id'] },
      Membership: { keyFields: ['id'] },
      Skill: { keyFields: ['id'] },
      Image: { keyFields: ['id'] },
      AgentTemplate: { keyFields: ['id'] },
      GatewayConnection: { keyFields: ['id'] },
      Upstream: { keyFields: ['id'] },
      RouterTier: { keyFields: ['id'] },
      CustomRole: { keyFields: ['id'] },
      Permission: { keyFields: ['id'] },
      // AgentSnapshot has no global id (identity = name, always nested under
      // agentSnapshots(agentId)); disable normalization so it embeds inline.
      AgentSnapshot: { keyFields: false },
    },
  }),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})
