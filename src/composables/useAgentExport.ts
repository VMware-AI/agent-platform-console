/**
 * Agent List — Excel (CSV) export pipeline.
 *
 * `useAgentExport()` reads the currently-active `filter` + `sort` from the
 * AgentListView, fetches every matching page from the existing `AGENTS_QUERY`
 * via a one-off `apolloClient.query()` loop, maps the rows into a localized
 * CSV, and triggers a browser download. Zero new dependencies — the whole
 * pipeline uses native `Blob` + `URL.createObjectURL` + UTF-8 BOM so
 * Microsoft Excel auto-detects the encoding and renders Chinese
 * characters without a manual import step.
 *
 * Usage:
 *   const { runExport, exporting } = useAgentExport()
 *   <cds-button :loading="exporting" @click="runExport">...</cds-button>
 */
import { ref } from 'vue'
import { apolloClient } from '@/api/graphql/client'
import { AGENTS_QUERY } from '@/api/graphql/queries/agents'
import type {
  Agent,
  AgentsQueryResult,
  AgentsQueryVars,
} from '@/api/graphql/types/agents'
import { STATUS_FROM_GQL, TYPE_FROM_GQL } from '@/api/graphql/types/agents'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

/** Per-page chunk size when streaming all results. 500 is small enough to
 * stay snappy, large enough to keep round-trips low. */
const EXPORT_PAGE_SIZE = 500

/** RFC 4180 cell escape: wrap in double quotes, double any internal quotes. */
function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/** Render agents as a CSV string. Headers + data rows are both
 * RFC 4180-quoted. Prepends a UTF-8 BOM so Excel detects the encoding. */
function buildCsv(agents: Agent[], headers: string[], locale: ReturnType<typeof useLocaleStore>): string {
  const headerLine = headers.map(escapeCsvCell).join(',')
  const dataLines = agents.map((a) => {
    const typeCell = locale.t(`agents.type.${TYPE_FROM_GQL[a.type]}`)
    const statusCell = locale.t(`agents.status.${STATUS_FROM_GQL[a.status]}`)
    const keyCell = a.apiKey?.name ?? '—'
    const ownerCell = a.credentials?.username ?? '—'
    return [a.name, typeCell, statusCell, keyCell, ownerCell]
      .map(escapeCsvCell)
      .join(',')
  })
  // UTF-8 BOM (﻿) — Excel needs this to interpret the file as UTF-8
  // (otherwise it falls back to its local codepage and Chinese chars break).
  return '﻿' + [headerLine, ...dataLines].join('\r\n')
}

/** Trigger a browser file download for an in-memory Blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Local-time timestamp suitable for a filename (e.g. 20260622-123456). */
function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/** Stream all matching pages via the existing AGENTS_QUERY.
 *  Uses one-shot `client.query()` calls (not the reactive `useQuery`) so
 *  the visible page is undisturbed. */
async function fetchAllAgents(variables: Omit<AgentsQueryVars, 'pagination'>): Promise<Agent[]> {
  // First page — gives us totalCount so we know how many more we need.
  const first = await apolloClient.query<AgentsQueryResult, AgentsQueryVars>({
    query: AGENTS_QUERY,
    variables: {
      ...variables,
      pagination: { page: 1, pageSize: EXPORT_PAGE_SIZE },
    },
  })
  const all = [...first.data.agents.nodes]
  const total = first.data.agents.totalCount
  if (all.length >= total) return all

  // Subsequent pages — sequential to keep things simple and avoid hammering
  // the backend. Server caps pageSize at 500 so this is bounded.
  const totalPages = first.data.agents.pageInfo.totalPages
  for (let page = 2; page <= totalPages; page++) {
    const next = await apolloClient.query<AgentsQueryResult, AgentsQueryVars>({
      query: AGENTS_QUERY,
      variables: {
        ...variables,
        pagination: { page, pageSize: EXPORT_PAGE_SIZE },
      },
    })
    all.push(...next.data.agents.nodes)
  }
  return all
}

export interface UseAgentExportOptions {
  /** A function returning the active filter+sort (read at click time, not
   *  at composable-init time, so the export always reflects the latest
   *  user-applied filters even if the composable is created before they
   *  are set). */
  readVariables: () => Omit<AgentsQueryVars, 'pagination'>
}

export function useAgentExport(options: UseAgentExportOptions) {
  const locale = useLocaleStore()
  const toast = useToast()
  const exporting = ref(false)

  async function runExport(): Promise<void> {
    if (exporting.value) return
    exporting.value = true
    try {
      const all = await fetchAllAgents(options.readVariables())

      const headers = [
        locale.t('agents.col.name'),
        locale.t('agents.col.type'),
        locale.t('agents.col.status'),
        locale.t('agents.col.key'),
        locale.t('agents.col.username'),
      ]
      const csv = buildCsv(all, headers, locale)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      downloadBlob(blob, `agents-${timestamp()}.csv`)

      toast.success(
        locale.t('agents.export.success').replace('{count}', String(all.length)),
      )
    } catch (err) {
      console.error('[agents] export failed', err)
      toast.error(locale.t('agents.export.fail'))
    } finally {
      exporting.value = false
    }
  }

  return { runExport, exporting }
}
