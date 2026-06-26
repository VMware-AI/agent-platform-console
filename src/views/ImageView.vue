<script setup lang="ts">
/**
 * 镜像管理 (Harbor images) — LLD-06 镜像仓 CRUD.
 *
 * List of container images (cds-grid) with create/edit (upsertImage) dialog and
 * delete (deleteImage, confirm). Wired to the real backend GraphQL — no mock or
 * inline data. Mirrors RateLimitPolicyView's list + upsert-dialog + delete shape.
 *
 * Backend ops (schema/content.graphql):
 *   images: [Image!]!                              (no directive)
 *   upsertImage(input: UpsertImageInput!): Image!  @hasRole(any: [admin])
 *   deleteImage(id: ID!): Boolean!                 @hasRole(any: [admin])
 * Non-admin callers get a backend error surfaced via toast.
 */
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import ImageFormDialog from '@/views/image/ImageFormDialog.vue'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import {
  IMAGES_QUERY,
  UPSERT_IMAGE,
  DELETE_IMAGE,
  type ImagesResult,
  type ImageNode,
  type UpsertImageResult,
  type UpsertImageVars,
  type DeleteImageResult,
  type DeleteImageVars,
} from '@/api/graphql/queries/images'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const {
  result,
  loading,
  error,
  refetch,
} = useQuery<ImagesResult>(IMAGES_QUERY)

const images = computed<ImageNode[]>(() => result.value?.images ?? [])

const dialogOpen = ref(false)
const editingImage = ref<ImageNode | null>(null)
const saving = ref(false)
const pendingDelete = ref<ImageNode | null>(null)

const deleteDialogBody = computed(() => {
  const target = pendingDelete.value
  if (!target) return ''
  return locale.t('image.confirm.deleteBody').replace('{name}', `${target.repository}:${target.tag}`)
})

function shortDigest(digest: string | null): string {
  if (!digest) return locale.t('image.digest.none')
  // sha256:<64 hex> — show the algorithm prefix + a 12-char head for readability.
  const [algo, hex] = digest.includes(':') ? digest.split(':', 2) : ['', digest]
  if (!hex) return digest
  return `${algo ? `${algo}:` : ''}${hex.slice(0, 12)}`
}

function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.locale === 'zh' ? 'zh-CN' : 'en-US')
}

function openCreate() {
  editingImage.value = null
  dialogOpen.value = true
}

function openEdit(image: ImageNode) {
  editingImage.value = image
  dialogOpen.value = true
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
  editingImage.value = null
}

async function submitImage(draft: {
  repository: string
  tag: string
  digest: string
  signed: boolean
}) {
  if (saving.value) return
  const isEditing = editingImage.value !== null
  saving.value = true
  try {
    await apolloClient.mutate<UpsertImageResult, UpsertImageVars>({
      mutation: UPSERT_IMAGE,
      variables: {
        input: {
          repository: draft.repository,
          tag: draft.tag,
          // Send null (not "") to clear an optional digest.
          digest: draft.digest.length > 0 ? draft.digest : null,
          signed: draft.signed,
        },
      },
    })
    toast.success(locale.t(isEditing ? 'image.toast.updated' : 'image.toast.created'))
    dialogOpen.value = false
    editingImage.value = null
    await refetch()
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('image.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

function requestDelete(image: ImageNode) {
  pendingDelete.value = image
}

function closeDelete() {
  pendingDelete.value = null
}

async function confirmDelete() {
  const target = pendingDelete.value
  pendingDelete.value = null
  if (!target) return
  try {
    await apolloClient.mutate<DeleteImageResult, DeleteImageVars>({
      mutation: DELETE_IMAGE,
      variables: { id: target.id },
    })
    toast.success(locale.t('image.toast.deleted'))
    await refetch()
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('image.toast.deleteFailed')))
  }
}

async function refreshImages() {
  if (loading.value) return
  try {
    await refetch()
    toast.success(locale.t('image.toast.refreshed'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('image.toast.refreshFailed')))
  }
}
</script>

<template>
  <section class="image-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('image.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('image.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button action="outline" status="primary" @click="openCreate">
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('image.action.create') }}
        </cds-button>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('image.action.refresh')"
          :title="locale.t('image.action.refresh')"
          @click="refreshImages"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
          <span>{{ locale.t('image.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="grid-card">
        <cds-grid border="row" column-layout="flex" role="grid" :aria-label="locale.t('image.table.label')">
          <cds-grid-column width="28%">{{ locale.t('image.col.repository') }}</cds-grid-column>
          <cds-grid-column width="15%">{{ locale.t('image.col.tag') }}</cds-grid-column>
          <cds-grid-column width="20%">{{ locale.t('image.col.digest') }}</cds-grid-column>
          <cds-grid-column width="12%">{{ locale.t('image.col.signed') }}</cds-grid-column>
          <cds-grid-column width="13%">{{ locale.t('image.col.createdAt') }}</cds-grid-column>
          <cds-grid-column width="12%">{{ locale.t('image.col.actions') }}</cds-grid-column>

          <cds-grid-row v-for="image in images" :key="image.id">
            <cds-grid-cell>
              <strong class="repo-name" :title="image.repository">{{ image.repository }}</strong>
            </cds-grid-cell>
            <cds-grid-cell>
              <span class="tag-name" :title="image.tag">{{ image.tag }}</span>
            </cds-grid-cell>
            <cds-grid-cell>
              <code class="digest" :title="image.digest ?? locale.t('image.digest.none')">
                {{ shortDigest(image.digest) }}
              </code>
            </cds-grid-cell>
            <cds-grid-cell>
              <cds-badge :status="image.signed ? 'success' : 'neutral'" class="status-badge">
                <cds-icon :shape="image.signed ? 'shield-check' : 'ban'" size="sm" aria-hidden="true"></cds-icon>
                {{ locale.t(image.signed ? 'image.signed.yes' : 'image.signed.no') }}
              </cds-badge>
            </cds-grid-cell>
            <cds-grid-cell>
              <span class="created-at">{{ formatCreatedAt(image.createdAt) }}</span>
            </cds-grid-cell>
            <cds-grid-cell>
              <div class="row-actions">
                <button type="button" class="row-action" @click="openEdit(image)">
                  <cds-icon shape="pencil" size="sm"></cds-icon>
                  <span>{{ locale.t('image.action.edit') }}</span>
                </button>
                <button type="button" class="row-action danger" @click="requestDelete(image)">
                  <cds-icon shape="trash" size="sm"></cds-icon>
                  <span>{{ locale.t('image.action.delete') }}</span>
                </button>
              </div>
            </cds-grid-cell>
          </cds-grid-row>

          <cds-grid-placeholder v-if="loading" role="status" aria-live="polite">
            <cds-icon shape="sync" size="xl" aria-hidden="true"></cds-icon>
            <p cds-text="subsection">{{ locale.t('image.loading') }}</p>
          </cds-grid-placeholder>
          <cds-grid-placeholder v-else-if="error" role="alert" aria-live="assertive">
            <cds-icon shape="error-standard" size="xl" aria-hidden="true"></cds-icon>
            <p cds-text="subsection">{{ locale.t('image.error') }}</p>
            <cds-button action="outline" size="sm" @click="refreshImages">
              {{ locale.t('image.action.refresh') }}
            </cds-button>
          </cds-grid-placeholder>
          <cds-grid-placeholder v-else-if="images.length === 0" role="status" aria-live="polite">
            <cds-icon shape="storage" size="xl" aria-hidden="true"></cds-icon>
            <p cds-text="subsection">{{ locale.t('image.empty') }}</p>
            <cds-button action="outline" size="sm" @click="openCreate">
              {{ locale.t('image.action.create') }}
            </cds-button>
          </cds-grid-placeholder>
        </cds-grid>
      </div>
    </div>

    <ImageFormDialog
      v-if="dialogOpen"
      :open="dialogOpen"
      :image="editingImage"
      :saving="saving"
      @close="closeDialog"
      @submit="submitImage"
    />

    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="locale.t('image.confirm.deleteTitle')"
      :body="deleteDialogBody"
      danger
      @close="closeDelete"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.image-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.page-head {
  flex: 0 0 auto;
}
.heading {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 28px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.desc {
  margin: 12px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 14px;
  line-height: 1.5;
  max-width: 720px;
}
.content-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  margin-top: 20px;
}
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.refresh-button {
  margin-left: auto;
}
.grid-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
}
.image-page cds-grid {
  display: block;
  width: 100%;
  min-width: 820px;
  min-height: 100%;
}
.repo-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-name {
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.digest {
  font-family: var(--cds-token-typography-font-family-code, monospace);
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.created-at {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
  white-space: nowrap;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 66px;
  white-space: nowrap;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.row-action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.row-action:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.row-action.danger {
  color: var(--cds-alias-status-danger, #c92100);
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: image-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes image-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 900px) {
  .refresh-button span {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
