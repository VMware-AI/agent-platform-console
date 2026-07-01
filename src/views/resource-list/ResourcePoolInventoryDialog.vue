<script setup lang="ts">
/**
 * Resource pool inventory viewer.
 *
 * Read-only modal that re-fetches a single resource pool via
 * `RESOURCE_POOL_QUERY` — the same GraphQL operation the list query uses,
 * but selected by `id` and constrained to just the `datacenters` subtree
 * so the vSphere inventory can be rendered.
 *
 * The query is fired lazily, only when the modal opens; the result is
 * cached in-memory by `loadedForPoolId` so re-opening the same pool
 * does not refetch. Switching to a different pool forces a reload.
 */
import { reactive, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { apolloClient } from '@/api/graphql/client'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { RESOURCE_POOL_QUERY } from '@/api/graphql/queries/resourcePools'
import type {
  ResourcePoolQueryResult,
  ResourcePoolQueryVars,
  VsphereDataCenter,
} from '@/types/resource-pool'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  poolId: string | null
  poolName: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const locale = useLocaleStore()

/** Datacenters are nullable — the single-pool query returns `null`
 *  when the pool has never been synced. The empty-state alert renders
 *  in that case. */
const datacenters = ref<VsphereDataCenter[] | null>(null)
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const loadedForPoolId = ref<string | null>(null)

/* ---------- Tree expansion state ----------
 * `cds-tree-item` is a CONTROLLED component: clicking the caret
 * fires `expandedChange` but never mutates its own `expanded` prop
 * (see `node_modules/@cds/core/tree-view/tree-item.element.js` —
 * `toggleExpanded() { this.expandedChange.emit(!this.expanded) }`).
 * We have to track the expanded set ourselves and bind `:expanded`
 * to it; otherwise the caret click appears to do nothing.
 *
 * Keys are synthesized from the path segments so each node is
 * unique within the tree (a cluster's path is unique inside a DC,
 * a host's path is unique inside a cluster, etc.). */
const expanded = reactive<Set<string>>(new Set())
const isExpanded = (key: string) => expanded.has(key)
function toggle(key: string) {
  if (expanded.has(key)) expanded.delete(key)
  else expanded.add(key)
}

// Reset the expansion set whenever a new pool is loaded. Default
// state matches the vSphere Client "Hosts and Clusters" pane out of
// the box: only the top-level DataCenter row is open, every group
// (Clusters / Datastores / Networks / Folders) underneath is
// collapsed so the user sees the four group headers + counts and
// drills in from there.
watch(
  () => loadedForPoolId.value,
  (poolId) => {
    expanded.clear()
    if (!poolId || !datacenters.value) return
    for (const dc of datacenters.value) {
      expanded.add(`dc:${dc.path}`)
    }
  },
)

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.poolId) return
    if (loadedForPoolId.value === props.poolId && datacenters.value) return
    datacenters.value = null
    errorMsg.value = null
    loading.value = true
    try {
      // `no-cache` (not `network-only`): the list query stores
      // `ResourcePool{id=X}` entities with NO `datacenters` field, and
      // Apollo's InMemoryCache normalizes by id — so a `network-only`
      // call would merge the cached partial entity and silently drop
      // `datacenters` from the response (and might even skip the network
      // hop entirely). `no-cache` bypasses both read and write.
      const { data } = await apolloClient.query<
        ResourcePoolQueryResult,
        ResourcePoolQueryVars
      >({
        query: RESOURCE_POOL_QUERY,
        variables: { id: props.poolId },
        fetchPolicy: 'no-cache',
      })
      datacenters.value = data.resourcePool.datacenters
      loadedForPoolId.value = props.poolId
    } catch (err) {
      console.error('[resource-pool] load inventory failed', err)
      errorMsg.value = graphqlErrorMessage(err, locale.t('resources.inventory.loadFail'))
    } finally {
      loading.value = false
    }
  },
  // `immediate: true` is REQUIRED: the parent mounts the dialog with
  // `open=true` already on the first tick (`v-if` flips truthy and
  // `:open="!!inventoryFor"` becomes true in the same render), so a
  // watcher with `immediate: false` never observes the initial
  // truthy value — the user clicks "查看", `inventoryFor` is set,
  // and without `immediate: true` the watch callback never fires,
  // which is why the modal shows the empty-state alert with NO
  // network request ever leaving the browser.
  { immediate: true },
)

function close() {
  if (loading.value) return
  emit('close')
}
</script>

<template>
  <cds-modal
    :hidden="!open"
    size="lg"
    :closable="!loading"
    @closeChange="close"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t('resources.inventory.title') }} — {{ poolName }}
      </h2>
    </cds-modal-header>
    <cds-modal-content>
      <div v-if="loading" class="state-block">
        <cds-progress-circle size="xl" status="info"></cds-progress-circle>
        <p cds-text="body">{{ locale.t('resources.loading') }}</p>
      </div>

      <cds-alert v-else-if="errorMsg" status="danger" closable>
        {{ errorMsg }}
      </cds-alert>

      <cds-alert
        v-else-if="!datacenters || datacenters.length === 0"
        status="info"
      >
        {{ locale.t('resources.inventory.empty') }}
      </cds-alert>

      <div v-else class="inventory-tree-wrap">
        <cds-tree>
          <cds-tree-item
            v-for="dc in datacenters"
            :key="`dc:${dc.path}`"
            :expanded="isExpanded(`dc:${dc.path}`)"
            @expandedChange="toggle(`dc:${dc.path}`)"
          >
            <cds-icon shape="vm" size="sm"></cds-icon>
            <span class="node-name">{{ dc.name }}</span>
            <span class="node-path">{{ dc.path }}</span>

            <cds-tree-item
              :expanded="isExpanded(`dc:${dc.path}#clusters`)"
              @expandedChange="toggle(`dc:${dc.path}#clusters`)"
            >
              <cds-icon shape="blocks-group" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.clusters') }} ({{ dc.clusters.length }})
              <cds-tree-item
                v-for="cl in dc.clusters"
                :key="`dc:${dc.path}/cluster:${cl.path}`"
                :expanded="isExpanded(`dc:${dc.path}/cluster:${cl.path}`)"
                @expandedChange="toggle(`dc:${dc.path}/cluster:${cl.path}`)"
              >
                <cds-icon shape="grid-view" size="sm"></cds-icon>
                <span class="node-name">{{ cl.name }}</span>
                <span class="node-path">{{ cl.path }}</span>

                <cds-tree-item
                  :expanded="isExpanded(`dc:${dc.path}/cluster:${cl.path}#hosts`)"
                  @expandedChange="toggle(`dc:${dc.path}/cluster:${cl.path}#hosts`)"
                >
                  <cds-icon shape="cpu" size="sm"></cds-icon>
                  {{ locale.t('resources.inventory.group.hosts') }} ({{ cl.esxiHosts.length }})
                  <cds-tree-item
                    v-for="h in cl.esxiHosts"
                    :key="`dc:${dc.path}/cluster:${cl.path}/host:${h.path || h.name}`"
                  >
                    <cds-icon shape="host" size="sm"></cds-icon>
                    <span class="node-name">{{ h.name }}</span>
                    <span class="node-path">{{ h.path }}</span>
                  </cds-tree-item>
                </cds-tree-item>

                <cds-tree-item
                  :expanded="isExpanded(`dc:${dc.path}/cluster:${cl.path}#rps`)"
                  @expandedChange="toggle(`dc:${dc.path}/cluster:${cl.path}#rps`)"
                >
                  <cds-icon shape="resource-pool" size="sm"></cds-icon>
                  {{ locale.t('resources.inventory.group.resourcePools') }} ({{ cl.resourcePools.length }})
                  <cds-tree-item
                    v-for="rp in cl.resourcePools"
                    :key="`dc:${dc.path}/cluster:${cl.path}/rp:${rp.path || rp.name}`"
                  >
                    <cds-icon shape="resource-pool" size="sm"></cds-icon>
                    <span class="node-name">{{ rp.name }}</span>
                    <span class="node-path">{{ rp.path }}</span>
                  </cds-tree-item>
                </cds-tree-item>
              </cds-tree-item>
            </cds-tree-item>

            <cds-tree-item
              :expanded="isExpanded(`dc:${dc.path}#datastores`)"
              @expandedChange="toggle(`dc:${dc.path}#datastores`)"
            >
              <cds-icon shape="storage" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.datastores') }} ({{ dc.datastores.length }})
              <cds-tree-item
                v-for="d in dc.datastores"
                :key="`dc:${dc.path}/ds:${d.path || d.name}`"
              >
                <cds-icon shape="storage" size="sm"></cds-icon>
                <span class="node-name">{{ d.name }}</span>
                <span class="node-path">{{ d.path }}</span>
              </cds-tree-item>
            </cds-tree-item>

            <cds-tree-item
              :expanded="isExpanded(`dc:${dc.path}#storagePolicies`)"
              @expandedChange="toggle(`dc:${dc.path}#storagePolicies`)"
            >
              <cds-icon shape="shield-check" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.storagePolicies') }} ({{ dc.storagePolicies.length }})
              <cds-tree-item
                v-for="sp in dc.storagePolicies"
                :key="`dc:${dc.path}/sp:${sp.path || sp.name}`"
              >
                <cds-icon shape="shield-check" size="sm"></cds-icon>
                <span class="node-name">{{ sp.name }}</span>
                <span class="node-path">{{ sp.path }}</span>
              </cds-tree-item>
            </cds-tree-item>

            <cds-tree-item
              :expanded="isExpanded(`dc:${dc.path}#networks`)"
              @expandedChange="toggle(`dc:${dc.path}#networks`)"
            >
              <cds-icon shape="router" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.networks') }} ({{ dc.networks.length }})
              <cds-tree-item
                v-for="n in dc.networks"
                :key="`dc:${dc.path}/net:${n.path || n.name}`"
              >
                <cds-icon shape="router" size="sm"></cds-icon>
                <span class="node-name">{{ n.name }}</span>
                <span class="node-path">{{ n.path }}</span>
              </cds-tree-item>
            </cds-tree-item>

            <cds-tree-item
              :expanded="isExpanded(`dc:${dc.path}#folders`)"
              @expandedChange="toggle(`dc:${dc.path}#folders`)"
            >
              <cds-icon shape="folder" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.folders') }} ({{ dc.folders.length }})
              <cds-tree-item
                v-for="f in dc.folders"
                :key="`dc:${dc.path}/folder:${f.path || f.name}`"
              >
                <cds-icon shape="folder" size="sm"></cds-icon>
                <span class="node-name">{{ f.name }}</span>
                <span class="node-path">{{ f.path }}</span>
              </cds-tree-item>
            </cds-tree-item>
          </cds-tree-item>
        </cds-tree>
      </div>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="loading" @click="close">
        {{ locale.t('resources.inventory.close') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
  font: inherit;
}
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--cds-alias-typography-color-muted, #666);
}
.inventory-tree-wrap {
  --cds-alias-object-container-background: transparent;
  font-family: inherit;
  max-height: 60vh;
  overflow: auto;
}
.inventory-tree-wrap :deep(cds-tree-item) {
  --font-size: 13px;
  --background: transparent;
  --color: var(--cds-alias-typography-color, #1d2129);
}
.inventory-tree-wrap :deep(cds-tree-item:hover) {
  --background: var(--cds-alias-object-container-background-shade, #f4f6fa);
}
.node-name {
  font-weight: 500;
  margin-right: 6px;
}
.node-path {
  color: var(--cds-alias-typography-color-muted, #888);
  font-size: 12px;
  font-family: var(--cds-alias-object-app-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
</style>