<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'
import './icons'

const theme = useThemeStore()
const locale = useLocaleStore()
</script>

<template>
  <cds-button action="ghost" type="button" @click="theme.toggle">
    <cds-icon :shape="theme.mode === 'light' ? 'moon' : 'sun'"></cds-icon>
    {{ locale.t(theme.mode === 'light' ? 'theme.dark' : 'theme.light') }}
  </cds-button>
</template>
