import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', 'e2e/**'],
  },

  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
  {
    name: 'app/clarity-web-components',
    rules: {
      // Clarity Core custom elements use native Web Component slots. These
      // are not deprecated Vue 2 scoped slots, even though the syntax is the same.
      'vue/no-deprecated-slot-attribute': 'off',
    },
  },
  {
    // Vitest globals for test files. Tests also import these explicitly from
    // 'vitest', but vitest.config sets `globals: true`, so declare them here so
    // `eslint .` stays green if a test omits an import.
    name: 'app/vitest-test-files',
    files: ['**/*.{test,spec}.{ts,mts,tsx}', '**/__tests__/**/*.{ts,mts,tsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  skipFormatting,
]
