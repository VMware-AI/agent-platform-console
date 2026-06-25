<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import './icons'

interface ChildItem {
  name: string
  label: string
  icon: string
  to: string
}

interface Group {
  parent: string
  parentIcon: string
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

const groups: Group[] = [
  {
    parent: '智能体中心',
    parentIcon: 'blocks-group',
    children: [
      { name: 'agents.list',        label: '智能体列表',   icon: 'atom',    to: '/agents/list' },
      { name: 'agents.config',      label: '智能体配置',   icon: 'details', to: '/agents/config' },
      { name: 'agents.marketplace', label: '智能体市场',   icon: 'store',   to: '/agents/marketplace' },
    ],
  },
  {
    parent: '模型网关配置',
    parentIcon: 'internet-of-things',
    children: [
      { name: 'mg.route', label: '模型路由', icon: 'forking', to: '/model-gateway/route' },
      { name: 'mg.key',   label: '虚拟密钥', icon: 'key',     to: '/model-gateway/key' },
      { name: 'mg.policy', label: '网关策略', icon: 'filter',  to: '/model-gateway/policy' },
    ],
  },
  {
    parent: '可观测性',
    parentIcon: 'eye',
    children: [
      { name: 'obs.metering', label: '计量中心', icon: 'bar-chart',    to: '/observability/metering' },
      { name: 'obs.monitor',  label: '实时监控', icon: 'dashboard',    to: '/observability/monitor' },
      { name: 'obs.requests', label: '请求日志', icon: 'list',         to: '/observability/requests' },
      { name: 'obs.audit',    label: '审计日志', icon: 'shield-check', to: '/observability/audit' },
    ],
  },
  {
    parent: '系统配置',
    parentIcon: 'cog',
    children: [
      { name: 'platform.resources', label: '资源池接入', icon: 'resource-pool', to: '/platform/resources' },
      { name: 'platform.gateway', label: '模型网关接入',   icon: 'router', to: '/platform/gateway' },
      { name: 'platform.users',   label: '用户与权限', icon: 'users',  to: '/platform/users' },
    ],
  },
]

// Per-group expand/collapse state (orthogonal to the global sidebar collapse).
const groupCollapsed = ref<Set<string>>(new Set())

function toggleGroup(name: string) {
  const next = new Set(groupCollapsed.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }
  groupCollapsed.value = next
}

function isGroupCollapsed(name: string): boolean {
  return groupCollapsed.value.has(name)
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
        :aria-label="props.collapsed ? '展开侧栏' : '折叠侧栏'"
        :title="props.collapsed ? '展开侧栏' : '折叠侧栏'"
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
        <span class="item-label">总览</span>
      </RouterLink>

      <div v-for="g in groups" :key="g.parent" class="group">
        <button
          type="button"
          class="parent"
          :aria-expanded="!isGroupCollapsed(g.parent)"
          @click="toggleGroup(g.parent)"
        >
          <cds-icon class="item-icon" :shape="g.parentIcon" size="md"></cds-icon>
          <span class="parent-label">{{ g.parent }}</span>
          <cds-icon
            class="caret"
            shape="angle"
            :direction="isGroupCollapsed(g.parent) ? 'right' : 'down'"
            size="sm"
          ></cds-icon>
        </button>
        <div v-show="!isGroupCollapsed(g.parent)" class="children">
          <RouterLink
            v-for="c in g.children"
            :key="c.name"
            class="child"
            :class="{ active: isActive(c.name) }"
            :to="c.to"
          >
            <cds-icon class="item-icon" :shape="c.icon" size="sm"></cds-icon>
            <span class="item-label">{{ c.label }}</span>
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
        title="总览"
        aria-label="总览"
      >
        <cds-icon shape="grid-view" size="md"></cds-icon>
      </RouterLink>

      <RouterLink
        v-for="c in groups.flatMap(g => g.children)"
        :key="c.name"
        class="icon-item"
        :class="{ active: isActive(c.name) }"
        :to="c.to"
        :title="c.label"
        :aria-label="c.label"
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
