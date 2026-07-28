<script setup lang="ts">
// Thin route-level wrapper around <MeteringDrillView>. The router needs one
// component per path; this layer decodes the URL params and the active drill
// state from useMeteringDrillState into the shared view's typed props.
//
// 404 (spec §8 rule 10) and 403 (spec §14 rule 5) are handled here: a missing
// identifier triggers a local NotFound inline, and a backend "not found" /
// "forbidden" GraphQL error propagates up as a card-level error in
// MeteringDrillView. We do NOT bounce to the dashboard — that would erase the
// user's URL context (spec §16 rule 2).

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MeteringDrillView from '@/components/metering/MeteringDrillView.vue'
import MeteringEmptyState from '@/components/metering/MeteringEmptyState.vue'
import { useLocaleStore } from '@/stores/locale'
import { useMeteringDrillState } from '@/composables/useMeteringDrillState'

const route = useRoute()
const locale = useLocaleStore()
const drill = useMeteringDrillState()

// Distinguish the three modes: pair (separate route name) wins over the
// (kind,id) pair routes used for the agent-only / model-only views.
const mode = computed<'agent' | 'model' | 'pair'>(() => {
  if (route.name === 'obs.metering.pair') return 'pair'
  const kind = route.params.kind
  return kind === 'agent' ? 'agent' : 'model'
})

const agentId = computed(() =>
  mode.value === 'model' ? '' : String(route.params.agentId ?? route.params.id ?? ''),
)
const agentName = computed(() => String(route.query.agentName ?? ''))
const model = computed(() =>
  mode.value === 'agent' ? '' : String(route.params.model ?? route.params.id ?? ''),
)

const isMissing = computed(() => !agentId.value && !model.value)
</script>

<template>
  <MeteringDrillView
    v-if="!isMissing"
    :mode="mode"
    :agent-id="agentId"
    :agent-name="agentName"
    :model="model"
    :range="drill.state.value.range"
  />
  <MeteringEmptyState
    v-else
    :title="locale.t('metering.empty.title')"
    :description="'未提供必要的标识参数'"
    compact
  />
</template>
