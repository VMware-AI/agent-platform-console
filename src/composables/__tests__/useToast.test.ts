import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useToast } from '@/composables/useToast'

// useToast uses module-scoped state shared across every useToast() call.
// Reset it before each test so cases don't leak into one another.
beforeEach(() => {
  useToast().clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useToast — status mapping', () => {
  it('success() pushes a toast with status "success" and the given message', () => {
    const toast = useToast()
    toast.success('Saved changes')

    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0]).toMatchObject({ message: 'Saved changes', status: 'success' })
  })

  it('error() pushes a toast with status "danger"', () => {
    const toast = useToast()
    toast.error('Failed to copy')

    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0].status).toBe('danger')
    expect(toast.toasts.value[0].message).toBe('Failed to copy')
  })

  it('warning() pushes a toast with status "warning"', () => {
    const toast = useToast()
    toast.warning('Disk almost full')

    expect(toast.toasts.value[0].status).toBe('warning')
  })

  it('info() pushes a toast with status "info"', () => {
    const toast = useToast()
    toast.info('Loading…')

    expect(toast.toasts.value[0].status).toBe('info')
  })

  it('show() defaults to status "info" when no status option is given', () => {
    const toast = useToast()
    toast.show('plain')

    expect(toast.toasts.value[0].status).toBe('info')
  })

  it('passes the optional title through to the toast', () => {
    const toast = useToast()
    toast.success('body text', { title: 'Done' })

    expect(toast.toasts.value[0].title).toBe('Done')
  })
})

describe('useToast — shared, reactive list', () => {
  it('two useToast() instances observe the same underlying list', () => {
    const a = useToast()
    const b = useToast()

    a.success('from a')

    expect(b.toasts.value).toHaveLength(1)
    expect(b.toasts.value[0].message).toBe('from a')
  })

  it('stacks multiple toasts in insertion order', () => {
    const toast = useToast()
    toast.info('first', { duration: 0 })
    toast.info('second', { duration: 0 })
    toast.info('third', { duration: 0 })

    expect(toast.toasts.value.map((t) => t.message)).toEqual(['first', 'second', 'third'])
  })

  it('assigns a unique, increasing id to each toast and returns it from show()', () => {
    const toast = useToast()
    const id1 = toast.info('a', { duration: 0 })
    const id2 = toast.info('b', { duration: 0 })

    expect(typeof id1).toBe('number')
    expect(id2).toBeGreaterThan(id1)
    expect(toast.toasts.value.map((t) => t.id)).toEqual([id1, id2])
  })
})

describe('useToast — dismiss / clear', () => {
  it('dismiss(id) removes only the matching toast', () => {
    const toast = useToast()
    const id1 = toast.info('keep', { duration: 0 })
    const id2 = toast.info('remove', { duration: 0 })

    toast.dismiss(id2)

    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0].id).toBe(id1)
    expect(toast.toasts.value[0].message).toBe('keep')
  })

  it('dismiss() with an unknown id is a no-op', () => {
    const toast = useToast()
    toast.info('stays', { duration: 0 })

    toast.dismiss(999999)

    expect(toast.toasts.value).toHaveLength(1)
  })

  it('clear() empties the entire list', () => {
    const toast = useToast()
    toast.info('a', { duration: 0 })
    toast.info('b', { duration: 0 })

    toast.clear()

    expect(toast.toasts.value).toHaveLength(0)
  })
})

describe('useToast — auto-dismiss timing', () => {
  it('info auto-dismisses after the default 5000ms', () => {
    const toast = useToast()
    toast.info('temporary')

    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(4999)
    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('success auto-dismisses after the default 5000ms', () => {
    const toast = useToast()
    toast.success('temporary')

    vi.advanceTimersByTime(5000)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('warning is sticky by default (no auto-dismiss)', () => {
    const toast = useToast()
    toast.warning('confirm me')

    vi.advanceTimersByTime(60000)
    expect(toast.toasts.value).toHaveLength(1)
  })

  it('danger (error) is sticky by default (no auto-dismiss)', () => {
    const toast = useToast()
    toast.error('a problem')

    vi.advanceTimersByTime(60000)
    expect(toast.toasts.value).toHaveLength(1)
  })

  it('duration: 0 forces a sticky toast even for info/success', () => {
    const toast = useToast()
    toast.info('sticky on purpose', { duration: 0 })

    vi.advanceTimersByTime(60000)
    expect(toast.toasts.value).toHaveLength(1)
  })

  it('explicit duration overrides the default and the per-status sticky rule', () => {
    const toast = useToast()
    // danger would normally be sticky, but an explicit duration wins.
    toast.error('auto close me', { duration: 1000 })

    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(999)
    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('only the timed-out toast is removed; others remain', () => {
    const toast = useToast()
    const stickyId = toast.error('sticky') // sticky by status
    toast.info('fades', { duration: 1000 })

    vi.advanceTimersByTime(1000)

    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0].id).toBe(stickyId)
  })
})
