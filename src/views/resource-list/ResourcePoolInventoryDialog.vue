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
import { ref, watch } from 'vue'
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
  { immediate: false },
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
            :key="dc.path"
            :expanded="true"
          >
            <cds-icon shape="vm" size="sm"></cds-icon>
            <span class="node-name">{{ dc.name }}</span>
            <span class="node-path">{{ dc.path }}</span>

            <cds-tree-item :expanded="true">
              <cds-icon shape="blocks-group" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.clusters') }} ({{ dc.clusters.length }})
              <cds-tree-item
                v-for="cl in dc.clusters"
                :key="cl.path"
                :expanded="true"
              >
                <cds-icon shape="grid-view" size="sm"></cds-icon>
                <span class="node-name">{{ cl.name }}</span>
                <span class="node-path">{{ cl.path }}</span>

                <cds-tree-item :expanded="true">
                  <cds-icon shape="cpu" size="sm"></cds-icon>
                  {{ locale.t('resources.inventory.group.hosts') }} ({{ cl.esxiHosts.length }})
                  <cds-tree-item
                    v-for="h in cl.esxiHosts"
                    :key="h.path || h.name"
                  >
                    <cds-icon shape="host" size="sm"></cds-icon>
                    <span class="node-name">{{ h.name }}</span>
                    <span class="node-path">{{ h.path }}</span>
                  </cds-tree-item>
                </cds-tree-item>

                <cds-tree-item :expanded="true">
                  <cds-icon shape="resource-pool" size="sm"></cds-icon>
                  {{ locale.t('resources.inventory.group.resourcePools') }} ({{ cl.resourcePools.length }})
                  <cds-tree-item
                    v-for="rp in cl.resourcePools"
                    :key="rp.path || rp.name"
                  >
                    <cds-icon shape="resource-pool" size="sm"></cds-icon>
                    <span class="node-name">{{ rp.name }}</span>
                    <span class="node-path">{{ rp.path }}</span>
                  </cds-tree-item>
                </cds-tree-item>
              </cds-tree-item>
            </cds-tree-item>

            <cds-tree-item>
              <cds-icon shape="storage" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.datastores') }} ({{ dc.datastores.length }})
              <cds-tree-item
                v-for="d in dc.datastores"
                :key="d.path || d.name"
              >
                <cds-icon shape="storage" size="sm"></cds-icon>
                <span class="node-name">{{ d.name }}</span>
                <span class="node-path">{{ d.path }}</span>
              </cds-tree-item>
            </cds-tree-item>

            <cds-tree-item>
              <cds-icon shape="router" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.networks') }} ({{ dc.networks.length }})
              <cds-tree-item
                v-for="n in dc.networks"
                :key="n.path || n.name"
              >
                <cds-icon shape="router" size="sm"></cds-icon>
                <span class="node-name">{{ n.name }}</span>
                <span class="node-path">{{ n.path }}</span>
              </cds-tree-item>
            </cds-tree-item>

            <cds-tree-item>
              <cds-icon shape="folder" size="sm"></cds-icon>
              {{ locale.t('resources.inventory.group.folders') }} ({{ dc.folders.length }})
              <cds-tree-item
                v-for="f in dc.folders"
                :key="f.path || f.name"
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