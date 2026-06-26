/**
 * Component tests for AppShell.vue.
 *
 * AppShell is the authenticated layout: a top bar (brand link + ThemeToggle +
 * LangSwitcher + UserMenu), a SideNav, and a <RouterView> content outlet. It
 * owns the `sidebarCollapsed` state (toggled via SideNav's `@toggle`) and keeps
 * `document.title` in sync with `locale.t('app.title')` on mount and whenever
 * the locale changes.
 *
 * Logout is delegated to the real `UserMenu` child (the shell renders it but does
 * not own the action). To assert "logout triggers the auth store logout" we mock
 * `@/stores/auth` with a controllable reactive stub exposing a `logout` spy and a
 * `user`. Mocking the store (not apolloClient) keeps the test off the network and
 * focused on the shell+menu contract with auth.
 *
 * Everything else stays REAL:
 *  - Real Pinia (setActivePinia) so `locale.t(...)` resolves the actual i18n
 *    strings and the theme store backs ThemeToggle — assertions target
 *    locale-key-driven text and emitted behavior, never brittle markup.
 *  - A real in-memory vue-router so <RouterView>, <RouterLink>, and UserMenu's
 *    `useRouter().push({ name: 'login' })` all work without stubbing the router.
 *  - The real child components (SideNav / UserMenu / ThemeToggle / LangSwitcher),
 *    so the integration of the shell with its regions is genuinely exercised.
 *
 * `cds-*` are Clarity custom elements; the vitest/vite config already registers
 * them, so we assert on structural regions, classes the shell actually toggles,
 * and plain DOM (the logout <button>), not on cds internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { defineComponent, h } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  createRouter,
  createMemoryHistory,
  type Router,
  type RouteRecordRaw,
} from 'vue-router'

/* ---------- Mock the auth store ---------- */

// A reactive stub matching the slice of the real auth store the shell tree
// consumes: `user` (read by UserMenu) and the `logout` action. `logout` is a
// spy that clears `user` like the real action, so we can assert it ran AND that
// it was wired to the menu's danger item — without touching apolloClient.
const logoutSpy = vi.fn(async () => {
  authState.user = null
})

const authState = reactive({
  user: { email: 'admin@example.com', displayName: 'Ada Admin' } as
    | { email: string; displayName: string }
    | null,
  logout: logoutSpy,
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState,
}))

// Imported AFTER the mock is registered.
import AppShell from '@/components/AppShell.vue'
import { useLocaleStore } from '@/stores/locale'

/* ---------- Helpers ---------- */

// A trivial outlet component so we can prove <RouterView> actually mounts the
// active route's content inside the shell.
const HomeStub = defineComponent({
  name: 'HomeStub',
  render: () => h('div', { class: 'route-outlet-content' }, 'OUTLET'),
})

const ROUTES: RouteRecordRaw[] = [
  { path: '/', redirect: '/overview' },
  { path: '/overview', name: 'overview', component: HomeStub },
  { path: '/login', name: 'login', component: HomeStub },
  // Catch-all so any RouterLink target in SideNav resolves without warnings.
  { path: '/:rest(.*)*', name: 'rest', component: HomeStub },
]

function makeRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes: ROUTES })
}

async function makeWrapper(): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = makeRouter()
  await router.push('/overview')
  await router.isReady()
  const wrapper = mount(AppShell, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

// Real locale (default 'zh') so rendered text can be compared to live strings.
let locale: ReturnType<typeof useLocaleStore>

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  authState.user = { email: 'admin@example.com', displayName: 'Ada Admin' }
  logoutSpy.mockClear()
  document.title = ''
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('AppShell — regions', () => {
  it('renders the three shell regions: topbar, sidenav, content outlet', async () => {
    const { wrapper } = await makeWrapper()

    expect(wrapper.find('header.topbar').exists()).toBe(true)
    // SideNav renders a <nav class="sidenav"> root.
    expect(wrapper.find('nav.sidenav').exists()).toBe(true)
    expect(wrapper.find('main.content').exists()).toBe(true)
  })

  it('mounts the active route inside the <RouterView> content outlet', async () => {
    const { wrapper } = await makeWrapper()

    const content = wrapper.find('main.content')
    expect(content.find('.route-outlet-content').exists()).toBe(true)
    expect(content.text()).toContain('OUTLET')
  })

  it('renders the brand link to /overview with the locale-driven brand text', async () => {
    const { wrapper } = await makeWrapper()

    const brand = wrapper.find('a.brand')
    expect(brand.exists()).toBe(true)
    // vue-router resolves <RouterLink to="/overview"> to an <a href="/overview">.
    expect(brand.attributes('href')).toBe('/overview')
    // Locale-key-driven, not a hardcoded string literal in the test.
    expect(brand.text()).toContain(locale.t('app.brand'))
  })

  it('renders the top-bar action cluster (theme/lang/user menu region)', async () => {
    const { wrapper } = await makeWrapper()

    // The shell groups its top-right controls in `.actions`; presence of that
    // region (and the user-menu trigger inside it) is the structural contract.
    const actions = wrapper.find('.actions')
    expect(actions.exists()).toBe(true)
    // UserMenu's trigger shows the authenticated user's display name.
    expect(actions.text()).toContain('Ada Admin')
  })
})

describe('AppShell — sidebar collapse', () => {
  it('starts expanded (no collapsed class) and collapses when SideNav emits toggle', async () => {
    const { wrapper } = await makeWrapper()

    const shell = wrapper.find('.shell')
    expect(shell.classes()).not.toContain('sidebar-collapsed')

    // Drive the real SideNav child's `toggle` emit rather than poking internals.
    const SideNav = wrapper.findComponent({ name: 'SideNav' })
    expect(SideNav.exists()).toBe(true)
    SideNav.vm.$emit('toggle')
    await flushPromises()

    expect(wrapper.find('.shell').classes()).toContain('sidebar-collapsed')
    // SideNav receives the new collapsed prop.
    expect(SideNav.props('collapsed')).toBe(true)
  })

  it('toggles back to expanded on a second toggle', async () => {
    const { wrapper } = await makeWrapper()
    const SideNav = wrapper.findComponent({ name: 'SideNav' })

    SideNav.vm.$emit('toggle')
    await flushPromises()
    expect(wrapper.find('.shell').classes()).toContain('sidebar-collapsed')

    SideNav.vm.$emit('toggle')
    await flushPromises()
    expect(wrapper.find('.shell').classes()).not.toContain('sidebar-collapsed')
    expect(SideNav.props('collapsed')).toBe(false)
  })
})

describe('AppShell — document title sync', () => {
  it('sets document.title to the locale title on mount', async () => {
    await makeWrapper()
    expect(document.title).toBe(locale.t('app.title'))
  })

  it('re-syncs document.title when the locale changes', async () => {
    await makeWrapper()
    const zhTitle = locale.t('app.title')
    expect(document.title).toBe(zhTitle)

    locale.setLocale('en')
    await flushPromises()

    const enTitle = locale.t('app.title')
    expect(enTitle).not.toBe(zhTitle) // sanity: the two locales differ
    expect(document.title).toBe(enTitle)
  })
})

describe('AppShell — logout wiring', () => {
  it('invokes the auth store logout from the UserMenu logout item', async () => {
    const { wrapper, router } = await makeWrapper()
    const pushSpy = vi.spyOn(router, 'push')

    // Scope to UserMenu specifically — the topbar has more than one AppDropdown
    // (LangSwitcher is another), so `.dd-trigger` alone is ambiguous.
    const userMenu = wrapper.findComponent({ name: 'UserMenu' })
    expect(userMenu.exists()).toBe(true)

    // Open the user menu (UserMenu wraps AppDropdown — click its trigger).
    const trigger = userMenu.find('.dd-trigger')
    expect(trigger.exists()).toBe(true)
    await trigger.trigger('click')
    await flushPromises()

    // The logout option carries the `user.logout` locale label; find it by text
    // among the menu's option button(s).
    const logoutLabel = locale.t('user.logout')
    const logoutBtn = userMenu
      .findAll('button.opt')
      .find((b) => b.text().includes(logoutLabel))
    expect(logoutBtn, 'logout menu item should be rendered').toBeTruthy()

    await logoutBtn!.trigger('click')
    await flushPromises()

    expect(logoutSpy).toHaveBeenCalledTimes(1)
    // UserMenu navigates to the login route after logout.
    expect(pushSpy).toHaveBeenCalledWith({ name: 'login' })
  })

  it('does not call logout merely by opening the menu', async () => {
    const { wrapper } = await makeWrapper()

    const userMenu = wrapper.findComponent({ name: 'UserMenu' })
    await userMenu.find('.dd-trigger').trigger('click')
    await flushPromises()

    expect(logoutSpy).not.toHaveBeenCalled()
  })
})
