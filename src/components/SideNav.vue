<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import './icons'

interface ChildItem {
  name: string
  labelKey: string
  icon: string
  to: string
}

interface Group {
  key: string
  titleKey: string
  icon: string
  children: ChildItem[]
}

const props = withDefaults(
  defineProps<{
    /** When true, only the icons are shown. Hovering shows a tooltip with the label. */
    collapsed?: boolean
  }>(),
  { collapsed: false },
)

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

const route = useRoute()
const router = useRouter()
const locale = useLocaleStore()
const auth = useAuthStore()

const groups: Group[] = [
  {
    key: 'agents',
    titleKey: 'nav.group.agents',
    icon: 'blocks-group',
    children: [
      { name: 'agents.list',        labelKey: 'nav.agents.list',        icon: 'atom',    to: '/agents/list' },
      { name: 'agents.config',      labelKey: 'nav.agents.config',      icon: 'details', to: '/agents/config' },
      { name: 'agents.marketplace', labelKey: 'nav.agents.marketplace', icon: 'store',   to: '/agents/marketplace' },
    ],
  },
  {
    key: 'gateway',
    titleKey: 'nav.group.gateway',
    icon: 'internet-of-things',
    children: [
      { name: 'mg.supplier', labelKey: 'nav.gateway.supplier', icon: 'blocks-group', to: '/model-gateway/supplier' },
      { name: 'mg.route',    labelKey: 'nav.gateway.route',    icon: 'forking',      to: '/model-gateway/route' },
      { name: 'mg.key',      labelKey: 'nav.gateway.key',      icon: 'key',          to: '/model-gateway/key' },
    ],
  },
  {
    key: 'observability',
    titleKey: 'nav.group.observability',
    icon: 'eye',
    children: [
      { name: 'obs.metering', labelKey: 'nav.obs.metering', icon: 'bar-chart',    to: '/observability/metering' },
      { name: 'obs.monitor',  labelKey: 'nav.obs.monitor',  icon: 'dashboard',    to: '/observability/monitor' },
      { name: 'obs.requests', labelKey: 'nav.obs.requests', icon: 'list',         to: '/observability/requests' },
      { name: 'obs.audit',    labelKey: 'nav.obs.audit',    icon: 'shield-check', to: '/observability/audit' },
    ],
  },
  {
    key: 'system',
    titleKey: 'nav.group.system',
    icon: 'cog',
    children: [
      { name: 'platform.resources', labelKey: 'nav.system.resources', icon: 'resource-pool', to: '/platform/resources' },
      { name: 'platform.gateway',   labelKey: 'nav.system.gateway',   icon: 'router',        to: '/platform/gateway' },
      { name: 'platform.users',     labelKey: 'nav.system.users',     icon: 'users',         to: '/platform/users' },
    ],
  },
]

// Visibility mirrors the router guard: a menu item is shown only when the
// current role is allowed to open its route. Each route's `meta` is read from
// the router (the single source of truth used by `resolveGuard`), so the menu
// and the guard can never drift. Without this, a non-admin would see
// admin-only items, click them, and be bounced back to the overview — which
// reads to the user as "clicking does nothing" (issue #29).
function canSee(name: string): boolean {
  const rec = router.getRoutes().find((r) => r.name === name)
  const meta = (rec?.meta ?? {}) as { admin?: boolean; roles?: readonly string[] }
  if (meta.admin && auth.role !== 'admin') return false
  if (meta.roles && !meta.roles.includes(auth.role ?? '')) return false
  return true
}

// Recomputes when the role changes (e.g. after login). Groups whose children
// are all hidden for the current role collapse away entirely.
const visibleGroups = computed<Group[]>(() =>
  groups
    .map((g) => ({ ...g, children: g.children.filter((c) => canSee(c.name)) }))
    .filter((g) => g.children.length > 0),
)

const visibleChildren = computed<ChildItem[]>(() =>
  visibleGroups.value.flatMap((g) => g.children),
)

// Per-group expand/collapse state (orthogonal to the global sidebar collapse).
const groupCollapsed = ref<Set<string>>(new Set())

function toggleGroup(key: string) {
  const next = new Set(groupCollapsed.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  groupCollapsed.value = next
}

function isGroupCollapsed(key: string): boolean {
  return groupCollapsed.value.has(key)
}

function isActive(name: string): boolean {
  return route.name === name
}
</script>

<template>
  <nav class="sidenav" :class="{ collapsed: props.collapsed }">
    <!-- Global collapse/expand toggle — sits at the top of the sidebar -->
    <div class="sidebar-toggle-row">
      <button
        type="button"
        class="sidebar-toggle"
        :aria-label="locale.t(props.collapsed ? 'nav.expand' : 'nav.collapse')"
        :title="locale.t(props.collapsed ? 'nav.expand' : 'nav.collapse')"
        :aria-expanded="!props.collapsed"
        @click="emit('toggle')"
      >
        <cds-icon
          shape="angle-double"
          :direction="props.collapsed ? 'right' : 'left'"
          size="md"
        ></cds-icon>
      </button>
    </div>

    <template v-if="!props.collapsed">
      <!-- Expanded: full sidebar with text labels -->
      <RouterLink
        class="item root"
        :class="{ active: isActive('overview') }"
        to="/overview"
      >
        <cds-icon class="item-icon" shape="grid-view" size="md"></cds-icon>
        <span class="item-label">{{ locale.t('nav.overview') }}</span>
      </RouterLink>

      <div v-for="g in visibleGroups" :key="g.key" class="group">
        <button
          type="button"
          class="parent"
          :aria-expanded="!isGroupCollapsed(g.key)"
          @click="toggleGroup(g.key)"
        >
          <cds-icon class="item-icon" :shape="g.icon" size="md"></cds-icon>
          <span class="parent-label">{{ locale.t(g.titleKey) }}</span>
          <cds-icon
            class="caret"
            shape="angle"
            :direction="isGroupCollapsed(g.key) ? 'right' : 'down'"
            size="sm"
          ></cds-icon>
        </button>
        <div v-show="!isGroupCollapsed(g.key)" class="children">
          <RouterLink
            v-for="c in g.children"
            :key="c.name"
            class="child"
            :class="{ active: isActive(c.name) }"
            :to="c.to"
          >
            <cds-icon class="item-icon" :shape="c.icon" size="sm"></cds-icon>
            <span class="item-label">{{ locale.t(c.labelKey) }}</span>
          </RouterLink>
        </div>
      </div>
    </template>

    <template v-else>
      <!-- Collapsed: icons only, each with a hover tooltip showing the label -->
      <RouterLink
        class="icon-item"
        :class="{ active: isActive('overview') }"
        to="/overview"
        :title="locale.t('nav.overview')"
        :aria-label="locale.t('nav.overview')"
      >
        <cds-icon shape="grid-view" size="md"></cds-icon>
      </RouterLink>

      <RouterLink
        v-for="c in visibleChildren"
        :key="c.name"
        class="icon-item"
        :class="{ active: isActive(c.name) }"
        :to="c.to"
        :title="locale.t(c.labelKey)"
        :aria-label="locale.t(c.labelKey)"
      >
        <cds-icon :shape="c.icon" size="md"></cds-icon>
      </RouterLink>
    </template>
  </nav>
</template>

<style scoped>
.sidenav {
  background: #1a3a5c;
  color: #e8edf2;
  height: 100%;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  overflow-x: hidden;
}
.sidenav.collapsed {
  padding: 10px 0;
  align-items: center;
  gap: 4px;
}

/* Top toggle row */
.sidebar-toggle-row {
  display: flex;
  justify-content: flex-end;
  padding: 2px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 2px;
  flex-shrink: 0;
}
.sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  background: transparent;
  border: 0;
  color: #c8d2dc;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.12s ease, color 0.12s ease;
  padding: 0;
  flex-shrink: 0;
}
.sidebar-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.sidebar-toggle:focus-visible {
  outline: 2px solid rgba(125, 211, 252, 0.6);
  outline-offset: 1px;
}

/* Expanded mode: full items with text */
.item,
.parent,
.child {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  color: #e8edf2;
  text-decoration: none;
  font-size: 14px;
  line-height: 1.4;
  transition: background-color 0.12s ease;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-family: inherit;
}
.root { font-weight: 500; }
.parent { font-weight: 500; user-select: none; }
.parent:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.item-icon {
  flex-shrink: 0;
  --color: currentColor;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.item-label {
  flex: 1;
  min-width: 0;
}
.caret {
  flex-shrink: 0;
  color: #c8d2dc;
  --color: currentColor;
  color: inherit;
  display: inline-flex;
  margin-left: auto;
}
.children {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.child {
  padding-left: 40px;
  font-weight: 400;
  color: #c8d2dc;
}
.item:hover,
.child:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.item.active,
.child.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-weight: 600;
}

/* Collapsed mode: icons only */
.icon-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0 auto;
  border-radius: 6px;
  color: #c8d2dc;
  text-decoration: none;
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
  flex-shrink: 0;
  --color: currentColor;
}
.icon-item :deep(cds-icon) {
  --color: currentColor;
  color: inherit;
}
.icon-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.icon-item.active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
</style>
