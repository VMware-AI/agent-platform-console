<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { fmtMoney, fmtNumber, fmtCompact, fmtPercent } from '@/utils/meter-format'
import { DASHBOARD_OVERVIEW_QUERY, type DashboardOverviewResult, type DashboardOverviewVars } from '@/api/graphql/queries/dashboard'
import '@/components/icons'

const locale = useLocaleStore(); const toast = useToast(); const router = useRouter()
const { result, error, refetch } = useQuery<DashboardOverviewResult, DashboardOverviewVars>(DASHBOARD_OVERVIEW_QUERY, { recentLimit: 6, noticeLimit: 6 })
watch(error, (err) => { if (err) toast.error(graphqlErrorMessage(err, locale.t('agents.error'))) })
const ov = computed(() => result.value?.dashboardOverview)
const stats = computed(() => ov.value?.stats)
const ag = computed(() => ov.value?.agentHealth)
const alerts = computed(() => ov.value?.activeAlerts ?? [])
const monthly = computed(() => ov.value?.monthlyUsage)
const ch = computed(() => ov.value?.componentHealth ?? [])
const genAt = computed(() => ov.value?.generatedAt)
const REFRESH_MS = 30_000; const autoRefresh = ref(true)
let timer: ReturnType<typeof setInterval> | undefined
function sr() { stopRefresh(); if (autoRefresh.value) timer = setInterval(() => { void refetch() }, REFRESH_MS) }
function stopRefresh() { if (timer) { clearInterval(timer); timer = undefined } }
onMounted(sr); onUnmounted(stopRefresh); watch(autoRefresh, (v) => { if (v) sr(); else stopRefresh() })
const lu = computed(() => genAt.value ? new Date(genAt.value).toLocaleTimeString() : '--')
const hi = (s: string) => s==='HEALTHY'?'success-standard':s==='WARNING'||s==='DEGRADED'?'warning-standard':'error-standard'
const hl = (s: string) => locale.t(`dashboard.health.${s.toLowerCase()}`)
const ags = (s: string) => ({RUNNING:'ds',STOPPED:'dst',ABNORMAL:'dse',UNKNOWN:'dst',running:'ds',stopped:'dst',abnormal:'dse',unknown:'dst'}[s]??'dst')
/** Unified donut data — shared by SVG, legend, and center total. */
const C = 314 // circumference = 2*PI*50
const AGENT_COLORS = { running: '#12b76a', abnormal: '#f04438', stopped: '#98a2b3', unknown: '#d0d5dd' } as const
interface DonutSegment { key: string; label: string; value: number; color: string; dash: string; offset: string }
const donutSegments = computed<DonutSegment[]>(() => {
  if (!ag.value) return []
  const all = [
    { key: 'running', label: agz('RUNNING'), value: ag.value.runningAgents, color: AGENT_COLORS.running },
    { key: 'abnormal', label: agz('ABNORMAL'), value: ag.value.abnormalAgents, color: AGENT_COLORS.abnormal },
    { key: 'stopped', label: agz('STOPPED'), value: ag.value.stoppedAgents, color: AGENT_COLORS.stopped },
    { key: 'unknown', label: agz('UNKNOWN'), value: ag.value.unknownAgents, color: AGENT_COLORS.unknown },
  ]
  const visible = all.filter(s => s.value > 0)
  if (visible.length === 0) return all.map(s => ({ ...s, dash: `0 ${C}`, offset: '0' }))
  const total = visible.reduce((s, x) => s + x.value, 0)
  let offset = 0
  return all.map(s => {
    if (s.value <= 0) return { ...s, dash: `0 ${C}`, offset: '0' }
    const len = (s.value / total) * C
    const seg: DonutSegment = { ...s, dash: `${len} ${C}`, offset: `${-offset}` }
    offset += len
    return seg
  })
})
const donutTotal = computed(() => ag.value?.totalAgents ?? 0)
const agz = (s: string) => locale.t(`dashboard.health.${s.toLowerCase()}`)
const sc = (s: string) => s==='CRITICAL'?'d':s==='WARNING'?'w':'i'
const cz = (s: string) => locale.t(`dashboard.health.${s.toLowerCase()}`)
// Status → color token class. Mirrors .bd.* palette (green / orange / red / grey).
const cs = (s: string) => s==='healthy'?'ck-h':s==='warning'||s==='degraded'?'ck-w':s==='critical'?'ck-d':'ck-i'
// Component display-name override. Backend returns raw identifiers
// (e.g. "GraphQL API"); rename a few for the dashboard's narrative so the
// card reads as user-facing platform health, not internal backend terms.
const cn = (name: string) => name === 'GraphQL API' ? locale.t('dashboard.compHealth.graphqlApi') : name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function go(nm:any, q?:Record<string,string>, p?:Record<string,string>) { void router.push({name:nm, query:q??{}, params:p??{}}) }
const hc = computed(() => (stats.value?.successfulCalls??0)+(stats.value?.failedCalls??0) > 0)
</script>

<template>
  <section class="d">
    <header class="dh"><div><h1 cds-text="title" class="heading">{{ locale.t('dashboard.overview.title') }}</h1><p cds-text="body" class="desc muted">{{ locale.t('dashboard.overview.subtitle') }}</p></div>
      <div class="tb"><span class="lu">{{ locale.t('dashboard.lastRefresh') }}: {{ lu }}</span><label class="rt"><input type="checkbox" v-model="autoRefresh"/>{{ locale.t('dashboard.autoRefresh') }}</label><cds-button action="outline" size="sm" @click="refetch()"><cds-icon shape="refresh" size="sm"/>{{ locale.t('dashboard.refresh') }}</cds-button></div></header>

    <!-- R1: 6KPI -->
    <div class="kg">
      <cds-card class="kc"><div class="ki"><span class="kl">{{ locale.t('dashboard.kpi.health') }}</span><span class="kv" :class="(stats?.overallStatus??'HEALTHY').toLowerCase()"><cds-icon :shape="hi(stats?.overallStatus??'HEALTHY')" size="md" solid/> {{ hl(stats?.overallStatus??'HEALTHY') }}</span><span class="ks">{{ locale.t('dashboard.kpi.critical') }}: {{ stats?.criticalCount??'--' }} · {{ locale.t('dashboard.kpi.warning') }}: {{ stats?.warningCount??'--' }}</span></div></cds-card>
      <cds-card class="kc clk" @click="go('agents.list')"><div class="ki"><span class="kl">{{ locale.t('dashboard.kpi.activeAgents') }}</span><span class="kv">{{ stats?.runningAgents??'--' }}<small> / {{ stats?.totalAgents??'--' }}</small></span><span class="ks">{{ locale.t('dashboard.kpi.abnormal') }}: {{ stats?.exceptionAgents??'--' }} · {{ locale.t('dashboard.kpi.stopped') }}: {{ stats?.stoppedAgents??'--' }}</span></div></cds-card>
      <cds-card class="kc clk" @click="go('mg.supplier')"><div class="ki"><span class="kl">{{ locale.t('dashboard.kpi.linkedModels') }}</span><span class="kv">{{ stats?.healthyModels??'--' }}<small> / {{ stats?.totalModels??'--' }}</small></span><span class="ks">{{ locale.t('dashboard.kpi.healthyModels') }}: {{ stats?.healthyModels??'--' }} · {{ locale.t('dashboard.kpi.totalModels') }}: {{ stats?.totalModels??'--' }}</span></div></cds-card>
      <cds-card class="kc clk" @click="go('obs.requests',{range:'24h'})"><div class="ki"><span class="kl">{{ locale.t('dashboard.kpi.totalCalls') }}</span><span class="kv">{{ fmtCompact((stats?.successfulCalls??0)+(stats?.failedCalls??0)) }}</span><span class="ks">{{ locale.t('dashboard.kpi.success') }}: {{ fmtNumber(stats?.successfulCalls??0) }} · {{ locale.t('dashboard.kpi.failed') }}: {{ fmtNumber(stats?.failedCalls??0) }}</span></div></cds-card>
      <cds-card class="kc clk" @click="go('obs.requests',{range:'24h',status:'failed'})"><div class="ki"><span class="kl">{{ locale.t('dashboard.kpi.successRate') }}</span><span class="kv">{{ hc&&stats?.successRate!=null ? fmtPercent(stats.successRate*100) : '--' }}</span><span class="ks">{{ locale.t('dashboard.kpi.failedCalls') }}: {{ fmtNumber(stats?.failedCalls??0) }}</span></div></cds-card>
      <cds-card class="kc clk" @click="go('obs.monitor',{range:'24h',metric:'latency'})"><div class="ki"><span class="kl">{{ locale.t('dashboard.kpi.p95latency') }}</span><span class="kv">{{ hc ? (stats?.p95LatencyMs?stats.p95LatencyMs+'ms':'--') : '--' }}</span><span class="ks">{{ locale.t('dashboard.kpi.avgLatency') }}</span></div></cds-card>
    </div>

    <!-- R2: Agent (8) + MonthlyUsage (4) -->
    <div class="r84">
      <cds-card class="pn"><div class="pi"><h2>{{ locale.t('dashboard.agentHealth') }}</h2>
        <div class="ah">
          <div class="ad"><svg viewBox="0 0 160 160" width="140" height="140"><circle cx="80" cy="80" r="50" fill="none" stroke="#e4e7ec" stroke-width="20"/>
            <!-- Donut: only segments with count > 0 are rendered. No zero-value
                 placeholders. Empty state (total=0) shows a muted ring. -->
            <template v-if="donutSegments.length>0">
              <circle v-for="s in donutSegments" :key="s.key" cx="80" cy="80" r="50" fill="none" :stroke="s.color" stroke-width="20" :stroke-dasharray="s.dash" :stroke-dashoffset="s.offset" transform="rotate(-90 80 80)" stroke-linecap="butt"/>
            </template>
            <circle v-else cx="80" cy="80" r="50" fill="none" stroke="#e4e7ec" stroke-width="20"/>
            <text x="80" y="74" text-anchor="middle" class="dtxt">{{ donutTotal||'--' }}</text><text x="80" y="92" text-anchor="middle" class="dstxt">{{ locale.t('dashboard.totalAgents') }}</text>
          </svg></div>
          <div class="as"><div class="asr" v-for="d in donutSegments" :key="d.key"><span class="asd" :class="ags(d.key)"/><span class="asl">{{ d.label }}</span><strong class="asc">{{ d.value }}</strong></div></div>
          <div class="alst"><div v-for="a in ag?.agents?.slice(0,5)??[]" :key="a.agentId" class="alr" @click="go('agents.detail',{},{id:a.agentId})"><span :title="a.agentName">{{ a.agentName }}</span><span class="asd" :class="ags(a.status)"/><span class="bd" :class="ags(a.status)">{{ agz(a.status) }}</span><span class="mu">{{ a.healthyInstanceCount }}/{{ a.totalInstanceCount }}</span></div></div>
        </div>
        <div class="pf"><cds-button action="outline" size="sm" @click="go('agents.list')">{{ locale.t('dashboard.viewAllAgents') }}</cds-button></div>
      </div></cds-card>
      <cds-card class="pn"><div class="pi"><h2>{{ locale.t('dashboard.monthlyUsage') }}</h2>
        <template v-if="monthly"><div class="us"><span>{{ locale.t('dashboard.col.tokens') }}</span><strong>{{ fmtNumber(monthly.totalTokens) }}</strong></div><div class="us"><span>{{ locale.t('dashboard.kpi.monthlyCost') }}</span><strong>{{ fmtMoney(monthly.estimatedCost) }}</strong></div><div class="us"><span>{{ locale.t('dashboard.projected') }}</span><strong>{{ fmtMoney(monthly.projectedMonthlyCost) }}</strong></div></template>
        <div class="pf"><cds-button action="outline" size="sm" @click="go('obs.metering',{tab:'platform',range:'THIS_MONTH'})">{{ locale.t('dashboard.gotoMetering') }}</cds-button></div>
      </div></cds-card>
    </div>

    <!-- R3: Alerts(8) + CompHealth(4) -->
    <div class="r84">
      <cds-card class="pn"><div class="pi"><h2>{{ locale.t('dashboard.alerts') }}</h2>
        <div v-if="alerts.length" class="al"><div v-for="a in alerts" :key="a.alertId" class="ar"><span class="bd" :class="sc(a.severity)">{{ a.severity }}</span><span class="atx">{{ a.title }}</span><span class="atm mu">{{ a.occurredAt?.slice(0,16).replace('T',' ') }}</span></div></div>
        <div v-else class="em"><span>{{ locale.t('dashboard.noAlerts') }}</span></div>
      </div></cds-card>
      <cds-card class="pn"><div class="pi"><h2>{{ locale.t('dashboard.compHealth') }}</h2>
        <div class="ch"><div v-for="c in ch" :key="c.componentName" class="chr"><span class="chn">{{ cn(c.componentName) }}</span><span class="chc">{{ c.healthyCount }}/{{ c.totalCount }}</span><span :class="cs(c.status)">{{ cz(c.status) }}</span></div></div>
      </div></cds-card>
    </div>
  </section>
</template>

<style scoped>
.d{display:flex;flex-direction:column;gap:16px;padding:20px 24px 32px;color:var(--cds-alias-object-app-foreground,#1d2939)}
.dh{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
/* Page heading / description — match AgentListView.heading + .desc
   exactly so the two pages share one visual hierarchy. */
.heading{margin:0;color:var(--cds-alias-object-app-foreground,#1b1b1b);font-size:28px;line-height:1.3;font-weight:600;letter-spacing:-0.01em}
.desc{margin:12px 0 0;color:var(--cds-alias-typography-color-300,#565656);font-size:14px;line-height:1.5;max-width:720px}
.muted{color:var(--cds-alias-typography-color-300,#565656)}
.tb{display:flex;align-items:center;gap:12px;font-size:12px}.lu{color:#667085;font-variant-numeric:tabular-nums}
.rt{display:flex;align-items:center;gap:4px;cursor:pointer}
.kg{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
.kc{overflow:hidden;--border:1px solid #e4e7ec;--box-shadow:0 1px 2px 0 rgba(16,24,40,.05),0 1px 3px 0 rgba(16,24,40,.08);--border-radius:10px;transition:box-shadow .18s ease,border-color .18s ease,transform .18s ease}.kc:hover{--box-shadow:0 4px 8px -2px rgba(16,24,40,.06),0 12px 24px -6px rgba(16,24,40,.12);--border-color:#cfd6df;transform:translateY(-1px)}.ki{padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.kl{font-size:12px;color:#667085}.kv{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.kv small{font-size:14px;font-weight:400;color:#667085}
.kv.healthy{color:#12b76a}.kv.warning,.kv.degraded{color:#f79009}.kv.critical{color:#f04438}
.ks{font-size:11px;color:#667085}.clk{cursor:pointer;transition:box-shadow .18s ease,border-color .18s ease,transform .18s ease}.clk:hover{box-shadow:0 4px 8px -2px rgba(16,24,40,.06),0 12px 24px -6px rgba(16,24,40,.12);transform:translateY(-1px)}
.r84{display:grid;grid-template-columns:8fr 4fr;gap:16px}
.pn{overflow:hidden;--border:1px solid #e4e7ec;--box-shadow:0 1px 2px 0 rgba(16,24,40,.04),0 2px 4px 0 rgba(16,24,40,.04),0 4px 8px 0 rgba(16,24,40,.04);--border-radius:12px;background:linear-gradient(180deg,#fbfcfd 0%,#ffffff 60%);transition:box-shadow .18s ease,border-color .18s ease,transform .18s ease}.pn:hover{--box-shadow:0 4px 8px -2px rgba(16,24,40,.06),0 16px 32px -8px rgba(16,24,40,.10);--border-color:#d0d5dd;transform:translateY(-1px)}.pi{padding:18px 20px;display:flex;flex-direction:column;gap:10px;min-height:280px}
.pi h2{margin:0;font-size:14px;font-weight:600;color:#101828;letter-spacing:.01em}.pf{margin-top:auto;display:flex;align-items:center;gap:8px;font-size:11px}
/* agent health */
.ah{display:grid;grid-template-columns:140px 128px minmax(0,1fr);gap:20px;flex:1;align-items:center;min-height:0}
.dtxt{font-size:28px;font-weight:700;fill:currentColor}.dstxt{font-size:11px;fill:#667085}
.as{display:flex;flex-direction:column;gap:6px;width:128px;min-width:128px;max-width:128px;flex:0 0 128px}.asr{display:grid;grid-template-columns:8px 56px 24px;align-items:center;column-gap:8px;font-size:12px;min-height:22px;width:104px}.asl{width:56px;line-height:20px;white-space:nowrap}.asc{width:24px;line-height:20px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.asd{width:8px!important;height:8px!important;min-width:8px!important;min-height:8px!important;max-width:8px!important;max-height:8px!important;padding:0!important;margin:0!important;border-radius:50%!important;flex-shrink:0;display:inline-flex;transform:none!important;box-sizing:border-box;border:0}.asd.ds{background:#12b76a}.asd.dse{background:#f04438}.asd.dst{background:#98a2b3}
.alr{display:grid;grid-template-columns:1fr 80px 50px;gap:6px;font-size:12px;padding:6px 8px;margin:0 -8px;border-radius:6px;border-bottom:1px solid #f0f0f0;cursor:pointer;align-items:center;transition:background-color .15s ease}.alr:hover{background:#f8fafc}
/* components */
.ch{display:flex;flex-direction:column;gap:2px}.chr{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 8px;margin:0 -8px;border-radius:6px;transition:background-color .15s ease}.chr:hover{background:#f8fafc}.chn{flex:1}.chc{font-variant-numeric:tabular-nums;min-width:32px;text-align:right}
/* Per-status color for platform-component health chip. Same palette as
   .bd.* (green / orange / red / grey) so the dashboard reads as one
   visual system — the names avoid colliding with .bd.* by using the
   ck- prefix (component-key). */
.ck-h{color:#12b76a}.ck-w{color:#f79009}.ck-d{color:#f04438}.ck-i{color:#667085}
/* alerts */
.al{display:flex;flex-direction:column;gap:2px}.ar{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 8px;margin:0 -8px;border-radius:6px;transition:background-color .15s ease}.ar:hover{background:#f8fafc}.atx{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.atm{flex-shrink:0}
.em{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:13px;color:#667085}.sm{font-size:11px;margin-top:4px}
/* usage */
.us{display:flex;justify-content:space-between;align-items:baseline;font-size:12px}.us strong{font-size:16px;font-variant-numeric:tabular-nums}
.td{color:#f04438}.ts{color:#12b76a}
.bd{font-size:11px;font-weight:600}.bd.ds{color:#12b76a}.bd.w{color:#f79009}.bd.dse{color:#f04438}.bd.i{color:#667085}.bd.dst{color:#98a2b3}
.mu{color:#667085}
@media(max-width:1599px){.kg{grid-template-columns:repeat(3,1fr)}}
@media(max-width:1199px){.r84{grid-template-columns:1fr};.kg{grid-template-columns:repeat(2,1fr)}}
@media(max-width:767px){.kg{grid-template-columns:1fr};.d{padding:12px}}
</style>
