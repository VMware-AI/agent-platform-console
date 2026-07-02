import 'modern-normalize/modern-normalize.css'
import '@cds/core/global.min.css'
// Layout & typography utility classes used by `cds-layout="..."` and `cds-text="..."`
// attributes. global.min.css only ships the component CSS, not these utilities.
import '@cds/core/styles/module.reset.min.css'
import '@cds/core/styles/module.layout.min.css'
import '@cds/core/styles/module.typography.min.css'
import '@cds/city/css/bundles/default.min.css'

// Per-component side-effect imports — each register.js wires the corresponding
// <cds-*> custom element via customElements.define().
// The `forms` module registers cds-control, cds-control-action, cds-control-message,
// cds-input, cds-checkbox, cds-radio, cds-select, cds-textarea, cds-toggle,
// cds-password, cds-range, cds-file, cds-form, cds-search, cds-datalist, etc.
// Layout and text *utility* classes (cds-layout="...", cds-text="...") are
// CSS-only and live in module.layout.min.css / module.typography.min.css.
import '@cds/core/alert/register.js'
import '@cds/core/badge/register.js'
import '@cds/core/button/register.js'
import '@cds/core/button-action/register.js'
import '@cds/core/button-sort/register.js'
import '@cds/core/card/register.js'
import '@cds/core/modal/register.js'
import '@cds/core/checkbox/register.js'
import '@cds/core/divider/register.js'
import '@cds/core/dropdown/register.js'
import '@cds/core/forms/register.js'
import '@cds/core/grid/register.js'
import '@cds/core/icon/register.js'
import '@cds/core/input/register.js'
import '@cds/core/navigation/register.js'
import '@cds/core/modal/register.js'
import '@cds/core/pagination/register.js'
import '@cds/core/password/register.js'
import '@cds/core/progress-circle/register.js'
import '@cds/core/select/register.js'
import '@cds/core/toggle/register.js'
import '@cds/core/tree-view/register.js'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { provideApolloClient } from '@vue/apollo-composable'
import App from './App.vue'
import router from './router'
import { apolloClient, onSessionExpired } from './api/graphql/client'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { useLocaleStore } from './stores/locale'
import './styles/global.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Provide the Apollo client to @vue/apollo-composable so `useQuery`/`useMutation`
// can find it inside any component without prop drilling.
provideApolloClient(apolloClient)

// Rehydrate UI state synchronously, then START the session rehydration (`me`
// round-trip) BEFORE the router installs: Vue Router 4 fires the initial
// navigation inside app.use(router), and the guard awaits auth.whenReady() —
// restore() must already be in flight by then or the guard would judge the
// stale localStorage copy (issue #31).
useThemeStore().init()
useLocaleStore().init()
const auth = useAuthStore()
const restored = auth.restore()

// Session expired mid-use: any non-`Me` operation answered UNAUTHENTICATED
// drops local auth state and lands on /login (registered here, not in
// client.ts, to avoid the client ⇄ store import cycle).
onSessionExpired(() => {
  auth.sessionExpired()
  if (router.currentRoute.value.name !== 'login') {
    router.replace({ name: 'login' })
  }
})

app.use(router)
restored.finally(() => {
  app.mount('#app')
})
