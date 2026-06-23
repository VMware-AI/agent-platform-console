import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client/core'

/**
 * Apollo client wired to the real agent-platform-backend.
 *
 * Auth is COOKIE-based (the backend sets an HttpOnly `ap_session` cookie on
 * login and validates it via an Origin/CSRF check). `credentials: 'include'`
 * makes the browser send that cookie on every cross-origin request — localhost
 * dev (console :5173 → backend :8080) is same-site, so the SameSite=Lax cookie
 * flows; the backend's CORS allowlist (ALLOWED_ORIGINS) permits the call.
 *
 * Set VITE_GRAPHQL_ENDPOINT to the backend /query URL (see .env.local).
 */
const httpLink = new HttpLink({
  uri: (import.meta.env.VITE_GRAPHQL_ENDPOINT as string | undefined) ?? '/query',
  credentials: 'include',
})

export const apolloClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})
