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
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**'],
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
  skipFormatting,
]
