/**
 * Component tests for PlatformSettingsView.vue (LLD-13 §3.2 / issue #17 PR-B).
 *
 * The view drives a single `useQuery(PLATFORM_SETTINGS_QUERY)` and one
 * `useMutation(UPDATE_PLATFORM_SETTINGS_MUTATION)`. We mock
 * `@vue/apollo-composable` so we control the `result` / `loading` / `error`
 * refs the form reads from, and a single `updateMutate` spy so Save is
 * independently assertable.
 *
 * States covered: loading, load error (alert), and data; plus the key
 * interactions: renders the loaded agentUser, the empty-input + unchanged
 * guards disable Save, editing + Save fires updatePlatformSettings with the
 * new (trimmed) value and refetches, and the backend rejection message is
 * surfaced inline (and Save does NOT refetch).
 *
 * Assertions target real data / locale-key-driven text / mutation variables —
 * not brittle exact markup. `cds-*` are custom elements; real Pinia is used so
 * `locale.t(...)` resolves real strings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import type { PlatformSettingsQueryResult } from '@/api/graphql/types'

/* ---------- Mock @vue/apollo-composable ---------- */

const queryResult: Ref<PlatformSettingsQueryResult | undefined> = ref(undefined)
const queryLoading = ref(false)
const queryError: Ref<unknown> = ref(null)
const refetchSpy = vi.fn()
const updateMutate = vi.fn()
const saving = ref(false)

vi.mock('@vue/apollo-composable', () => ({
  useQuery: () => ({
    result: queryResult,
    loading: queryLoading,
    error: queryError,
    refetch: refetchSpy,
  }),
  useMutation: () => ({ mutate: updateMutate, loading: saving }),
}))

// Imported AFTER the mocks are registered.
import PlatformSettingsView from '@/views/PlatformSettingsView.vue'

/* ---------- Fixtures ---------- */

function makeResult(agentUser = 'agent'): PlatformSettingsQueryResult {
  return { platformSettings: { agentUser } }
}

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

let wrapper: VueWrapper | null = null

function agentUserInput() {
  return wrapper!.find<HTMLInputElement>('input.app-input')
}
function settingsForm() {
  return wrapper!.find('form.settings-form')
}
/**
 * `cds-button` is a custom element, so Vue serializes `:disabled` as a string
 * attribute (`"true"` / `"false"`) rather than toggling the native boolean
 * attribute. The Save button is therefore "disabled" iff the attribute reads
 * the string `"true"`.
 */
function saveDisabled(): boolean {
  return wrapper!.find('cds-button[type="submit"]').attributes('disabled') === 'true'
}

beforeEach(() => {
  setActivePinia(createPinia())
  queryResult.value = undefined
  queryLoading.value = false
  queryError.value = null
  saving.value = false
  refetchSpy.mockReset()
  updateMutate.mockReset()
  // Silence the intentional console.error on the failure path.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('PlatformSettingsView — states', () => {
  it('renders the loading block on the initial load (loading + no result)', () => {
    queryLoading.value = true
    queryResult.value = undefined
    wrapper = mount(PlatformSettingsView, mountConfig)

    expect(wrapper.find('.loading-block').exists()).toBe(true)
    expect(wrapper.text()).toContain('加载中') // settings.platform.loading
    // No form while still loading the first value.
    expect(wrapper.find('.settings-form').exists()).toBe(false)
  })

  it('renders the load-error alert (locale-key text) when the query errors', () => {
    queryError.value = new Error('boom')
    queryResult.value = undefined
    wrapper = mount(PlatformSettingsView, mountConfig)

    const alert = wrapper.find('cds-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('status')).toBe('danger')
    expect(alert.text()).toContain('加载平台设置失败') // settings.platform.loadError
  })

  it('renders the loaded agentUser in the editable input', () => {
    queryResult.value = makeResult('deploybot')
    wrapper = mount(PlatformSettingsView, mountConfig)

    expect(agentUserInput().element.value).toBe('deploybot')
    // The {{AGENT_USER}} hint is shown.
    expect(wrapper.text()).toContain('{{AGENT_USER}}') // settings.platform.agentUserHint
  })
})

describe('PlatformSettingsView — Save guards', () => {
  it('disables Save initially (value unchanged from the server)', () => {
    queryResult.value = makeResult('agent')
    wrapper = mount(PlatformSettingsView, mountConfig)

    expect(saveDisabled()).toBe(true)
  })

  it('disables Save when the input is emptied (empty-input guard)', async () => {
    queryResult.value = makeResult('agent')
    wrapper = mount(PlatformSettingsView, mountConfig)

    await agentUserInput().setValue('   ') // whitespace-only → trimmed empty
    expect(saveDisabled()).toBe(true)
  })

  it('enables Save once the value is edited to a non-empty different value', async () => {
    queryResult.value = makeResult('agent')
    wrapper = mount(PlatformSettingsView, mountConfig)

    await agentUserInput().setValue('newagent')
    expect(saveDisabled()).toBe(false)
  })
})

describe('PlatformSettingsView — Save mutation wiring', () => {
  it('fires updatePlatformSettings with the trimmed new value and refetches on success', async () => {
    queryResult.value = makeResult('agent')
    updateMutate.mockResolvedValue({
      data: { updatePlatformSettings: { agentUser: 'newagent' } },
    })
    wrapper = mount(PlatformSettingsView, mountConfig)

    await agentUserInput().setValue('  newagent  ')
    await settingsForm().trigger('submit')
    await flushPromises()

    expect(updateMutate).toHaveBeenCalledWith({ input: { agentUser: 'newagent' } })
    expect(refetchSpy).toHaveBeenCalledTimes(1)
  })

  it('surfaces the backend rejection message inline and does NOT refetch (error path)', async () => {
    queryResult.value = makeResult('agent')
    updateMutate.mockRejectedValue(new Error('agentUser 不能为空'))
    wrapper = mount(PlatformSettingsView, mountConfig)

    await agentUserInput().setValue('newagent')
    await settingsForm().trigger('submit')
    await flushPromises()

    expect(updateMutate).toHaveBeenCalledTimes(1)
    expect(refetchSpy).not.toHaveBeenCalled()
    const alert = wrapper.find('cds-alert.settings-save-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('status')).toBe('danger')
    expect(alert.text()).toContain('agentUser 不能为空')
    expect(console.error).toHaveBeenCalled()
  })

  it('does not fire the mutation when the form is submitted with an empty value (guard)', async () => {
    queryResult.value = makeResult('agent')
    wrapper = mount(PlatformSettingsView, mountConfig)

    await agentUserInput().setValue('')
    await settingsForm().trigger('submit')
    await flushPromises()

    expect(updateMutate).not.toHaveBeenCalled()
  })
})
