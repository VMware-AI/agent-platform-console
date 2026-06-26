import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core'

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

export const apolloClient = new ApolloClient({
  link: httpLink,
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
