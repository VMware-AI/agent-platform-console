<script setup lang="ts">
/**
 * 路由分层编辑器 (Router-tier upsert form).
 *
 * `setRouterTier(tier, modelAlias)` keys by `tier`, so this dialog maps one
 * difficulty tier (SIMPLE/MEDIUM/COMPLEX/REASONING) to a model alias. When
 * editing an existing mapping the tier is locked; when adding a new one the
 * operator picks an as-yet-unmapped tier. Mirrors the UpstreamFormDialog card.
 */
import { computed, reactive, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import {
  ROUTER_TIER_LEVELS,
  type RouterTierLevel,
  type RouterTierNode,
} from '@/api/graphql/queries/gateway-routing'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** The tier mapping being edited; null for a new mapping. */
  tier: RouterTierNode | null
  /** Tier levels that already have a mapping (excluded from the create picker). */
  usedTiers: RouterTierLevel[]
  /** True while the parent's setRouterTier mutation is in flight. */
  saving?: boolean
}>()

const locale = useLocaleStore()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', payload: { tier: RouterTierLevel; modelAlias: string }): void
}>()

interface FormState {
  tier: RouterTierLevel
  modelAlias: string
}

const form = reactive<FormState>({ tier: 'SIMPLE', modelAlias: '' })

const isEditing = computed(() => Boolean(props.tier))

// Tiers still available when creating a new mapping (editing keeps its own tier).
const availableTiers = computed<RouterTierLevel[]>(() =>
  ROUTER_TIER_LEVELS.filter((level) => !props.usedTiers.includes(level)),
)

watch(
  () => [props.open, props.tier] as const,
  ([open]) => {
    if (!open) return
    if (props.tier) {
      form.tier = props.tier.tier
      form.modelAlias = props.tier.modelAlias
    } else {
      form.tier = availableTiers.value[0] ?? 'SIMPLE'
      form.modelAlias = ''
    }
  },
  { immediate: true },
)

const canSubmit = computed(() => form.modelAlias.trim().length > 0 && !props.saving)

function close() {
  if (!props.saving) emit('close')
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', { tier: form.tier, modelAlias: form.modelAlias.trim() })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="rt-fade">
      <div
        v-if="open"
        class="rt-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t(isEditing ? 'upstreamRouter.tier.dialog.editTitle' : 'upstreamRouter.tier.dialog.createTitle')"
        @click="onBackdropClick"
      >
        <div class="rt-card" @click.stop>
          <h2 cds-text="section" class="rt-title">
            {{ locale.t(isEditing ? 'upstreamRouter.tier.dialog.editTitle' : 'upstreamRouter.tier.dialog.createTitle') }}
          </h2>

          <form class="rt-form" @submit.prevent="submit">
            <label class="rt-field">
              <span class="rt-label">{{ locale.t('upstreamRouter.tier.field.tier') }}</span>
              <cds-select v-if="!isEditing">
                <select v-model="form.tier" :aria-label="locale.t('upstreamRouter.tier.field.tier')">
                  <option v-for="level in availableTiers" :key="level" :value="level">
                    {{ locale.t(`upstreamRouter.tierLevel.${level}`) }}
                  </option>
                </select>
              </cds-select>
              <strong v-else class="rt-tier-locked">
                {{ locale.t(`upstreamRouter.tierLevel.${form.tier}`) }}
              </strong>
            </label>

            <label class="rt-field">
              <span class="rt-label">{{ locale.t('upstreamRouter.tier.field.modelAlias') }}</span>
              <cds-input>
                <input
                  v-model="form.modelAlias"
                  type="text"
                  autocomplete="off"
                  :placeholder="locale.t('upstreamRouter.tier.field.modelAliasPlaceholder')"
                  :aria-label="locale.t('upstreamRouter.tier.field.modelAlias')"
                />
              </cds-input>
              <small class="rt-hint muted">{{ locale.t('upstreamRouter.tier.field.modelAliasHint') }}</small>
            </label>
          </form>

          <div class="rt-actions">
            <cds-button type="button" action="outline" :disabled="saving" @click="close">
              {{ locale.t('upstreamRouter.action.cancel') }}
            </cds-button>
            <cds-button
              type="button"
              action="solid"
              status="primary"
              :loading-state="saving ? 'loading' : 'default'"
              :disabled="!canSubmit"
              @click="submit"
            >
              {{ locale.t('upstreamRouter.action.save') }}
            </cds-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rt-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 1100;
  padding: 24px;
}
.rt-card {
  width: min(460px, 100%);
  display: flex;
  flex-direction: column;
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  gap: 14px;
}
.rt-title {
  margin: 0;
  font-size: 18px;
}
.rt-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rt-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rt-label {
  font-size: 13px;
  font-weight: 600;
}
.rt-field cds-input,
.rt-field cds-select {
  width: 100%;
}
.rt-tier-locked {
  font-size: 14px;
}
.rt-hint {
  font-size: 12px;
}
.rt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.rt-fade-enter-active,
.rt-fade-leave-active {
  transition: opacity 0.18s ease;
}
.rt-fade-enter-from,
.rt-fade-leave-to {
  opacity: 0;
}
</style>
