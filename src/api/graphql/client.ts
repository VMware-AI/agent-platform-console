import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client/core'
import { onError } from '@apollo/client/link/error'

/**
 * Single Apollo Client for the app, wired to the real agent-platform-backend.
 *
 * Transport: HTTP POST to the same-origin path `/query`. The path is the
 * fixed contract between this SPA and the docker nginx config
 * (docker/nginx.conf.template `location = /query { proxy_pass …; }`); it is
 * intentionally not configurable. Auth: httpOnly session cookie (LLD-12).
 * `login` makes the backend set the `ap_session` cookie; `credentials:
 * 'include'` replays it on every request, so the session id is never exposed
 * to JS (no localStorage token to exfiltrate via XSS). `me` rehydrates on
 * reload; `logout` clears the cookie server-side.
 *
 * CSRF is enforced backend-side via an Origin/Referer allowlist (the browser
 * always sends Origin on the POST), so the console origin must be in the
 * backend's ALLOWED_ORIGINS. The SameSite=Lax cookie is only sent when `/query`
 * is SAME-ORIGIN as the app — in dev that means going through the Vite proxy
 * (see vite.config.ts), not an absolute cross-origin URL.
 */

const httpLink = new HttpLink({
  uri: '/query',
  // Send + receive the httpOnly ap_session cookie on every request.
  credentials: 'include',
})

/**
 * Session-expiry hook (issue #31). This module cannot import the auth store or
 * the router directly — auth.ts imports `apolloClient` from here, so that would
 * be a cycle. main.ts registers the real handler (clear auth state + redirect
 * to login) once the stores exist.
 */
let sessionExpiredHandler: (() => void) | null = null
export function onSessionExpired(handler: () => void): void {
  sessionExpiredHandler = handler
}

const errorLink = onError(({ graphQLErrors, operation }) => {
  // `Me` is the session probe: restore()/changePassword read its null result to
  // decide logged-out, so its UNAUTHENTICATED must not bounce every cold boot.
  if (operation.operationName === 'Me') return
  // The backend ErrorPresenter attaches a stable machine code (classifyCode):
  // any "unauthenticated" resolver/directive error carries code UNAUTHENTICATED.
  const expired = graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')
  if (expired) sessionExpiredHandler?.()
})

export const apolloClient = new ApolloClient({
  link: from([errorLink, httpLink]),
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
    },
  }),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})
