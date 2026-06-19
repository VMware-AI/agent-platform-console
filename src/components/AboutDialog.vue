<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'
import BrandLogo from './BrandLogo.vue'
import '@/components/icons'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const locale = useLocaleStore()

function close() {
  emit('close')
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="about-fade">
      <div
        v-if="props.open"
        class="about-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t('about.title')"
        @click="onBackdropClick"
      >
        <div class="about-card">
          <button
            type="button"
            class="about-close-x"
            :aria-label="locale.t('about.close')"
            :title="locale.t('about.close')"
            @click="close"
          >
            <cds-icon shape="times" size="md"></cds-icon>
          </button>

          <div class="about-header">
            <BrandLogo :size="56" />
            <h2 cds-text="title" class="about-title">{{ locale.t('about.title') }}</h2>
          </div>

          <p cds-text="body" class="about-tagline">
            {{ locale.t('about.tagline') }}
          </p>

          <dl class="about-meta">
            <div class="about-meta-row">
              <dt>{{ locale.t('about.version') }}</dt>
              <dd>v0.1.0</dd>
            </div>
          </dl>

          <small class="about-copyright">{{ locale.t('about.copyright') }}</small>

          <div class="about-actions">
            <cds-button type="button" action="solid" status="primary" block @click="close">
              {{ locale.t('about.close') }}
            </cds-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.about-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 24px;
}
.about-card {
  position: relative;
  width: min(520px, 100%);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 36px 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.about-close-x {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: var(--cds-alias-typography-color-300, #6b6b6b);
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.about-close-x:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.about-close-x :deep(cds-icon) {
  --color: currentColor;
  color: inherit;
}
.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.about-title {
  margin: 0;
  font-size: 20px;
}
.about-tagline {
  margin: 0;
  line-height: 1.7;
  color: var(--cds-alias-typography-color-300, #565656);
  text-align: center;
}
.about-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  background: var(--cds-alias-object-app-background, #f4f4f4);
  border-radius: 8px;
}
.about-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.about-meta-row dt {
  margin: 0;
  color: var(--cds-alias-typography-color-300, #6b6b6b);
}
.about-meta-row dd {
  margin: 0;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-family: ui-monospace, "SFMono-Regular", "Menlo", monospace;
}
.about-copyright {
  text-align: center;
  color: var(--cds-alias-typography-color-300, #6b6b6b);
  font-size: 12px;
}
.about-actions {
  margin-top: 8px;
}
.about-actions :deep(cds-button) {
  width: 100%;
}

.about-fade-enter-active,
.about-fade-leave-active {
  transition: opacity 0.18s ease;
}
.about-fade-enter-from,
.about-fade-leave-to {
  opacity: 0;
}
</style>
