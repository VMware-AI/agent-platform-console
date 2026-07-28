// Composable: tie the metering center's drill state to URL query params.
//
// Spec §8要求 URL 持久化 source / dimension / agentId / modelId / time range / page
// / keyword / sort。vue-router 的 query 是 reactive 的,这层封装把 raw query
// 转换成强类型的 MeteringDrillState,并通过 replaceState 写回 URL (避免在浏览器
// history 里塞一堆中间状态)。
//
// The composable is "source of truth" for the page — components read from it
// once on mount, and watch() changes to refetch data. It does NOT hold its own
// cache; Apollo handles that.

import { computed } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import type { MeteringTimeRange } from '@/api/graphql/queries/metering'

export type MeteringDimension = 'agent' | 'model' | 'department' | 'key' | 'day'
export type MeteringSource = 'platform' | 'gateway'

export interface MeteringDrillState {
  source: MeteringSource
  range: MeteringTimeRange
  dimension: MeteringDimension
  agentId?: string
  agentName?: string
  model?: string
  page: number
  pageSize: number
  keyword: string
}

const DEFAULTS: MeteringDrillState = {
  source: 'platform',
  range: 'LAST_7_DAYS',
  dimension: 'agent',
  page: 1,
  pageSize: 20,
  keyword: '',
}

// Whitelist of valid TimeRange values; anything else falls back to the default
// so a hand-edited URL (?range=FOREVER) can never white-screen the page.
const VALID_RANGES: MeteringTimeRange[] = ['LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH']
const VALID_DIMS: MeteringDimension[] = ['agent', 'model', 'department', 'key', 'day']
const VALID_SRC: MeteringSource[] = ['platform', 'gateway']

function pickStr(value: LocationQueryRaw[string] | undefined, fallback: string): string {
  if (value == null) return fallback
  const s = Array.isArray(value) ? value[0] : value
  return s && typeof s === 'string' ? s : fallback
}

function pickInt(value: LocationQueryRaw[string] | undefined, fallback: number): number {
  const raw = pickStr(value, String(fallback))
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function pickEnum<T extends string>(value: LocationQueryRaw[string] | undefined, allowed: readonly T[], fallback: T): T {
  const s = pickStr(value, fallback)
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback
}

export function useMeteringDrillState() {
  const route = useRoute()
  const router = useRouter()

  const state = computed<MeteringDrillState>(() => ({
    source: pickEnum(route.query.source, VALID_SRC, DEFAULTS.source),
    range: pickEnum(route.query.range, VALID_RANGES, DEFAULTS.range),
    dimension: pickEnum(route.query.dimension, VALID_DIMS, DEFAULTS.dimension),
    agentId: pickStr(route.query.agentId, '') || undefined,
    agentName: pickStr(route.query.agentName, '') || undefined,
    model: pickStr(route.query.model, '') || undefined,
    page: pickInt(route.query.page, DEFAULTS.page),
    pageSize: pickInt(route.query.pageSize, DEFAULTS.pageSize),
    keyword: pickStr(route.query.keyword, '') || '',
  }))

  // Push updates back to the URL using replace (no history spam). Accepts a
  // partial state so callers can update one field without rebuilding the
  // entire URL.
  function update(patch: Partial<MeteringDrillState>): void {
    const next: LocationQueryRaw = { ...route.query }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === null) {
        delete next[k]
      } else {
        next[k] = String(v)
      }
    }
    // Page reset on filter change — spec §9 rule 7.
    if (patch.keyword !== undefined || patch.range !== undefined || patch.source !== undefined ||
        patch.agentId !== undefined || patch.model !== undefined || patch.dimension !== undefined) {
      next.page = '1'
    }
    void router.replace({ query: next }).catch(() => undefined)
  }

  function reset(): void {
    void router.replace({ query: {} }).catch(() => undefined)
  }

  return { state, update, reset }
}

// Helper used by view components to build a drill-down route while preserving
// any non-drill query params already on the URL.
export function drillPathQuery(base: Record<string, string | undefined>): LocationQueryRaw {
  const out: LocationQueryRaw = {}
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) out[k] = v
  }
  return out
}
