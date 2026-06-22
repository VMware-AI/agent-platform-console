import { ref } from 'vue'

/**
 * Global toast / snack-bar framework.
 *
 * Usage from any component / store:
 * ```ts
 * const toast = useToast()
 * toast.success('Copied "OpenClaw Primary Key"')
 * toast.error('Failed to copy', { duration: 5000 })
 * toast.info('Loading…', { duration: 0 })  // duration=0 → sticky
 * ```
 *
 * Rendered by `<ToastContainer />` mounted once in `App.vue`. Multiple toasts
 * stack vertically at the top-right; each auto-dismisses after `duration` ms
 * (default 5000). Closable via the cds-alert's built-in × button.
 */

export type ToastStatus = 'info' | 'success' | 'warning' | 'danger'

export interface ToastOptions {
  /** Visual status. Drives the cds-alert color. Defaults to `'info'`. */
  status?: ToastStatus
  /** Auto-dismiss delay in ms. `0` means sticky (no auto-dismiss). */
  duration?: number
  /** Optional title shown above the message. */
  title?: string
}

export interface Toast {
  id: number
  message: string
  status: ToastStatus
  title?: string
}

// Module-scoped state — every caller of `useToast()` shares the same list.
const toasts = ref<Toast[]>([])
let nextId = 1

export function useToast() {
  function show(message: string, options: ToastOptions = {}): number {
    const id = nextId++
    const status = options.status ?? 'info'
    const toast: Toast = { id, message, status, title: options.title }
    toasts.value = [...toasts.value, toast]

    // Auto-dismiss policy:
    //   - `duration: 0`  → sticky (never auto-close; user must click ×)
    //   - `duration: N`  → auto-close after N ms (explicit override)
    //   - no duration option:
    //       * `warning` / `danger` default to sticky (the user must confirm
    //         the message — these are problems, not notifications)
    //       * `info` / `success` default to 5000 ms
    const explicit = options.duration
    if (explicit === 0) {
      // sticky on purpose
    } else if (typeof explicit === 'number') {
      setTimeout(() => dismiss(id), explicit)
    } else {
      const stickyByStatus = status === 'warning' || status === 'danger'
      if (!stickyByStatus) {
        setTimeout(() => dismiss(id), 5000)
      }
    }
    return id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function clear() {
    toasts.value = []
  }

  return {
    toasts,
    show,
    success: (message: string, options: Omit<ToastOptions, 'status'> = {}) =>
      show(message, { ...options, status: 'success' }),
    error: (message: string, options: Omit<ToastOptions, 'status'> = {}) =>
      show(message, { ...options, status: 'danger' }),
    warning: (message: string, options: Omit<ToastOptions, 'status'> = {}) =>
      show(message, { ...options, status: 'warning' }),
    info: (message: string, options: Omit<ToastOptions, 'status'> = {}) =>
      show(message, { ...options, status: 'info' }),
    dismiss,
    clear,
  }
}
