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
import '@cds/core/card/register.js'
import '@cds/core/checkbox/register.js'
import '@cds/core/divider/register.js'
import '@cds/core/dropdown/register.js'
import '@cds/core/forms/register.js'
import '@cds/core/icon/register.js'
import '@cds/core/input/register.js'
import '@cds/core/navigation/register.js'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { useLocaleStore } from './stores/locale'
import './styles/global.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// Rehydrate persisted state before the router runs its first guard.
useAuthStore().restore()
useThemeStore().init()
useLocaleStore().init()

app.mount('#app')
