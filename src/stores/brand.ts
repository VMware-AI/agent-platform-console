import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { gql } from '@apollo/client/core'

const Q = gql`
  query Brand($ref: String!) {
    platformBrandConfig(ref: $ref) {
      platformName
      shortName
      browserTitle
      loginSubtitle
      logoUrl
      faviconUrl
      loginBgUrl
      primaryColor
      loginBgOverlayEnabled
      loginBgOverlayOpacity
      loginCardPosition
      loginBgPosition
      loginBgSize
      copyrightText
      supportText
      supportUrl
    }
  }
`

export const useBrandStore = defineStore('brand', () => {
  const { result, refetch } = useQuery(Q, { ref: 'default' }, () => ({
    fetchPolicy: 'cache-and-network',
  }))
  // In-memory override: written directly by the branding page after a
  // successful save, so the shell/login update immediately without waiting
  // for the next network round-trip.
  const override = ref<Record<string, unknown> | null>(null)
  const cfg = computed(() => override.value ?? result.value?.platformBrandConfig)
  const title = computed(() => cfg.value?.platformName || '智能体管理平台')
  const logo = computed(() => cfg.value?.logoUrl || null)
  const favicon = computed(() => cfg.value?.faviconUrl || null)
  const loginBg = computed(() => cfg.value?.loginBgUrl || null)
  const primary = computed(() => cfg.value?.primaryColor || '#0063B1')
  const copyright = computed(() => cfg.value?.copyrightText || '')
  const subtitle = computed(() => cfg.value?.loginSubtitle || '')
  const overlayOpacity = computed(() =>
    cfg.value?.loginBgOverlayEnabled ? (cfg.value?.loginBgOverlayOpacity ?? 40) : 0,
  )

  /** Push saved settings straight into the store (bypasses Apollo cache propagation). */
  function setSettings(settings: Record<string, unknown> | null | undefined) {
    if (!settings) return
    override.value = settings
    apply(settings)
  }

  function apply(settings?: Record<string, unknown> | null) {
    const c =
      (settings as { platformName?: string; browserTitle?: string; faviconUrl?: string } | null) ??
      cfg.value
    if (!c) return
    if (c.browserTitle) document.title = c.browserTitle
    else if (c.platformName) document.title = c.platformName
    if (c.faviconUrl) {
      let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = c.faviconUrl
    }
  }

  return {
    cfg,
    title,
    logo,
    favicon,
    loginBg,
    primary,
    copyright,
    subtitle,
    overlayOpacity,
    apply,
    refetch,
    setSettings,
  }
})
