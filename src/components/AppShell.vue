<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale'
import SideNav from './SideNav.vue'
import BrandLogo from './BrandLogo.vue'
import ThemeToggle from './ThemeToggle.vue'
import LangSwitcher from './LangSwitcher.vue'
import UserMenu from './UserMenu.vue'
import ChangePasswordModal from './ChangePasswordModal.vue'
import './icons'

const auth = useAuthStore()
const locale = useLocaleStore()

const sidebarCollapsed = ref(false)

function syncTitle() {
  if (typeof document !== 'undefined') {
    document.title = locale.t('app.title')
  }
}

onMounted(syncTitle)
watch(() => locale.locale, syncTitle)
</script>

<template>
  <div class="shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <header class="topbar">
      <RouterLink to="/overview" class="brand" aria-label="返回主页">
        <BrandLogo :size="38" />
        <strong>{{ locale.t('app.brand') }}</strong>
      </RouterLink>
      <div class="spacer"></div>
      <div class="actions">
        <ThemeToggle />
        <span class="divider" aria-hidden="true"></span>
        <LangSwitcher />
        <span class="divider" aria-hidden="true"></span>
        <UserMenu />
      </div>
    </header>

    <SideNav
      class="sidenav"
      :collapsed="sidebarCollapsed"
      @toggle="sidebarCollapsed = !sidebarCollapsed"
    />
    <main class="content" :class="{ 'content-empty': auth.mustChangePassword }">
      <RouterView v-if="!auth.mustChangePassword" />
    </main>

    <ChangePasswordModal v-if="auth.mustChangePassword" />
  </div>
</template>

<style scoped>
.shell {
  height: 100vh;
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 64px 1fr;
  grid-template-areas:
    'topbar topbar'
    'sidenav content';
  background: var(--cds-alias-object-app-background, #fafafa);
  overflow: hidden;
  transition: grid-template-columns 0.2s ease;
}
.shell.sidebar-collapsed {
  grid-template-columns: 48px 1fr;
}
.topbar {
  grid-area: topbar;
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  background: var(--cds-alias-object-container-background, #fff);
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  text-decoration: none;
  padding: 4px 8px;
  margin: 0 -8px;
  border-radius: 6px;
  transition: background-color 0.12s ease;
}
.brand:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.brand:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}
.brand strong {
  font-size: 17px;
  letter-spacing: 0.01em;
}
.spacer { flex: 1; }
.actions {
  display: flex;
  align-items: center;
  height: 100%;
}
.divider {
  display: inline-block;
  width: 1px;
  height: 20px;
  background: var(--cds-alias-object-border-color, #e8e8e8);
  margin: 0 12px;
  flex-shrink: 0;
}
/* Force the right-side ghost buttons to be truly transparent
   so they blend with the topbar. */
.actions :deep(cds-button) {
  --background: transparent;
  --border-color: transparent;
  --border-width: 0;
  --color: var(--cds-alias-object-app-foreground, #1b1b1b);
  background: transparent;
  border: 0;
  box-shadow: none;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.actions :deep(cds-button:hover) {
  background: transparent;
}
.actions :deep(cds-button cds-icon) {
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.sidenav {
  grid-area: sidenav;
  min-height: 0;
}
.content {
  grid-area: content;
  padding: 24px;
  /* `min-width: 0` is required on a grid item so its descendants (notably
     `cds-grid`, a custom element whose default `min-width: auto` would
     otherwise expand to its content's intrinsic min-width and re-introduce
     a horizontal scroll on the page).
     `overflow: hidden` (instead of `auto`) suppresses any in-content
     scrollbar — pages like the agent list own their own internal scrolling
     only when the user opts in (e.g. via `cds-grid` `height="..."`). */
  min-width: 0;
  overflow: hidden;
}
/* When the user must change their password, the content area renders as a
   calm empty surface so the modal reads as the only "real" content. The
   RouterView is hidden, so children don't fetch or display data behind the
   modal. */
.content-empty {
  background: var(--cds-alias-object-app-background, #fafafa);
}
</style>
