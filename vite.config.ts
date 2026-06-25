import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
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
      // (LLD-12). Set VITE_GRAPHQL_ENDPOINT=/query (relative) to route through it.
      '/query': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
