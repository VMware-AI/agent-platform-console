import { fileURLToPath } from 'node:url'

import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'

import viteConfig from './vite.config'

// Reuse the app's Vite config (notably the `@` -> ./src alias and the Vue
// plugin) so tests resolve modules exactly like the app does.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      // Tests live alongside source under src/**; never reach into build output.
      exclude: [...configDefaults.exclude, 'dist/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
