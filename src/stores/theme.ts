import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark'
const STORAGE_KEY = 'clarity-theme'

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>('light')

  function apply() {
    if (typeof document !== 'undefined') {
      document.body.setAttribute('cds-theme', mode.value)
    }
  }

  function toggle() {
    mode.value = mode.value === 'light' ? 'dark' : 'light'
  }

  // Called once on app boot from main.ts.
  function init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
      if (stored === 'light' || stored === 'dark') {
        mode.value = stored
      } else if (typeof window !== 'undefined' && window.matchMedia) {
        mode.value = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
    } catch {
      // ignore
    }
    apply()
  }

  // Persist & apply whenever mode changes.
  watch(mode, () => {
    try {
      localStorage.setItem(STORAGE_KEY, mode.value)
    } catch {
      // ignore
    }
    apply()
  })

  return { mode, toggle, init, apply }
})
