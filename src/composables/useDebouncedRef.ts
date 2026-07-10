import { onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * A `Ref<string>` whose value lags behind the source by `delayMs`. Useful for
 * throttling reactive side-effects that would otherwise fire on every keystroke
 * (e.g. refetching a GraphQL query as the user types into a filter input).
 *
 * Reads return the **debounced** value, so consumers should `watch` it (not
 * the source) when they need to react to changes. Writes go to the source
 * ref directly via the standard `v-model` / `.value =` path; the debounced
 * mirror updates after the quiescent window.
 *
 * Timer is cleared on component unmount to avoid leaking across HMR /
 * teardown.
 *
 * @example
 *   const nameInput = ref('')
 *   const nameDebounced = useDebouncedRef(nameInput, 300)
 *   watch(nameDebounced, (v) => refetch({ filter: { nameContains: v || null } }))
 */
export function useDebouncedRef(source: Ref<string>, delayMs = 300): Ref<string> {
  const debounced = ref(source.value)
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  watch(source, (value) => {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      debounced.value = value
      timeoutId = null
    }, delayMs)
  })
  onUnmounted(() => {
    if (timeoutId !== null) clearTimeout(timeoutId)
  })
  return debounced
}