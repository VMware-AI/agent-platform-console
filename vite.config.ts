import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Default backend for the Vite dev proxy. The browser hits `/query` on the dev
 * server (same origin so the httpOnly `ap_session` cookie is sent — see
 * LLD-12), and the proxy forwards to BACKEND_BASE_URL.
 *
 * Override at invocation:
 *   BACKEND_BASE_URL=http://10.0.0.5:8080 npm run dev
 *
 * The same env var also drives the docker image at runtime (see
 * docker/entrypoint.sh + nginx.conf.template) — one name, two stages.
 */
const DEFAULT_BACKEND = 'http://127.0.0.1:8080'

// Prod build opts are only applied when NODE_ENV=production (set by
// `npm run build:prod`, which Dockerfile invokes by default). Local
// `npm run build` and `npm run dev` keep Vite defaults so debugging stays
// readable (no `drop: console`, sourcemaps on, etc).
const isProd = (process.env.NODE_ENV ?? 'development') === 'production'

// loadEnv with prefixes='' reads ALL env vars (including non-VITE_ ones)
// from process.env AND .env files. We need this to pick up BACKEND_BASE_URL,
// which is intentionally NOT prefixed because it is the docker runtime
// contract, not a Vite compile-time constant.
const env = loadEnv(isProd ? 'production' : 'development', process.cwd(), '')
const backendBaseUrl = env.BACKEND_BASE_URL || DEFAULT_BACKEND

// https://vite.dev/config/
// NOTE: keep this as a plain object (not a function) so vitest.config.ts can
// `mergeConfig(viteConfig, ...)` without tripping over UserConfigFnObject in
// vitest 4's narrower type definitions.
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Treat all <cds-*> tags as custom elements (Clarity Core) so the
          // Vue compiler does not warn about them.
          isCustomElement: (tag) => tag.startsWith('cds-'),
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Proxy the GraphQL endpoint so the browser sees it SAME-ORIGIN in dev —
      // required for the SameSite=Lax `ap_session` cookie to be sent on the POST
      // (LLD-12). VITE_GRAPHQL_ENDPOINT in .env is the same-origin path the
      // app POSTs to; the proxy then forwards to the real backend.
      '/v1': {
        target: backendBaseUrl,
        changeOrigin: true,
      },
      '/query': {
        target: backendBaseUrl,
        changeOrigin: true,
        // The backend's CSRF guard compares the Origin header's host against
        // the request Host. `changeOrigin` rewrites the Host header (to the
        // backend's host, e.g. 127.0.0.1:8080) but does NOT rewrite the Origin
        // header — by default Origin passes through unchanged, so a browser
        // loading the console from `http://127.0.0.1:5173` reaches the
        // backend with Origin `http://127.0.0.1:5173` against Host
        // `127.0.0.1:8080`, which fails both the allowlist check (default
        // ALLOWED_ORIGINS is `http://localhost:5173`) and the sameOrigin
        // string compare. Result: every POST returns 403 and the UI looks
        // "dead" — mutations, logins, queries all silently fail.
        //
        // Rewrite Origin to the target so the CSRF guard sees a same-origin
        // POST regardless of which hostname the dev opens the console on.
        // Done via http-proxy's `configure` hook (runs on every proxied
        // request, before the request hits the wire).
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const target = new URL(backendBaseUrl)
            proxyReq.setHeader(
              'origin',
              `${target.protocol}//${target.host}`,
            )
          })
        },
      },
    },
  },
  build: isProd
    ? {
        target: 'es2022',
        minify: 'esbuild',
        cssCodeSplit: true,
        sourcemap: false,
        chunkSizeWarningLimit: 600,
        reportCompressedSize: false,
        rollupOptions: {
          output: {
            manualChunks: {
              vue: ['vue', 'vue-router', 'pinia'],
              apollo: ['@apollo/client', '@vue/apollo-composable', 'graphql'],
              clarity: ['@cds/core', '@cds/city'],
            },
          },
        },
      }
    : undefined,
  // Top-level `esbuild` (Vite 6) is forwarded to esbuild for both transform
  // AND minify. `drop` lives on esbuild's CompressOptions (not Transform),
  // which Vite's ESBuildOptions type does not declare — declare just the
  // field we use so ESLint's no-explicit-any rule stays happy. Verified in
  // vite runtime: esbuild options are merged into both the loader and the
  // minifier (dist/node/chunks/dep-*.js).
  esbuild: isProd
    ? { drop: ['console', 'debugger'] as ('console' | 'debugger')[] }
    : undefined,
})
