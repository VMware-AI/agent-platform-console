<script setup lang="ts">
import '@/components/icons'

interface Metric {
  key: string
  label: string
  icon: string
  color: string
  bg: string
  value: string
  suffix?: string
  note: string
  limit?: string
}

const metrics: Metric[] = [
  {
    key: 'instances',
    label: '实例运行',
    icon: 'cpu',
    color: '#1a8a4a',
    bg: '#e6f4ea',
    value: '0',
    suffix: '/ 0',
    note: '运行中 / 总数',
  },
  {
    key: 'pools',
    label: '计算池',
    icon: 'storage',
    color: '#1e6fcc',
    bg: '#e3f0ff',
    value: '1',
    note: '已启用 1 的资源池',
  },
  {
    key: 'today',
    label: '今日用量',
    icon: 'bolt',
    color: '#7c3aed',
    bg: '#f0e6ff',
    value: '0',
    note: '0 次调用 · $0.00',
  },
  {
    key: 'monthly',
    label: '月度 Token',
    icon: 'line-chart',
    color: '#d97706',
    bg: '#fff2e0',
    value: '0',
    note: '0% 已用',
    limit: '上限 1.0M',
  },
]

interface Step {
  num: number
  title: string
  desc: string
}

const steps: Step[] = [
  { num: 1, title: '配置"资源池接入"', desc: '添加 vSphere 资源池并测试连接' },
  { num: 2, title: '配置"模型网关"',   desc: '添加模型网关地址,并测试连接' },
  { num: 3, title: '配置"模型路由"',   desc: '添加大模型地址和 api key,并测试连接' },
  { num: 4, title: '创建"虚拟密钥"',   desc: '创建虚拟密钥,用于分配给智能体' },
  { num: 5, title: '创建"虚拟密钥"',   desc: '创建虚拟密钥,用于分配给智能体' },
]
</script>

<template>
  <section class="dashboard">
    <header class="dash-header">
      <h1 cds-text="title" class="heading">总览</h1>
    </header>

    <div class="stats">
      <cds-card v-for="m in metrics" :key="m.key">
        <div cds-layout="vertical p:md gap:xs" class="metric">
          <div class="metric-head">
            <span
              class="metric-icon"
              :style="{ background: m.bg, color: m.color }"
            >
              <cds-icon :shape="m.icon" size="md"></cds-icon>
            </span>
            <span class="metric-label">{{ m.label }}</span>
          </div>
          <div class="metric-value">
            {{ m.value }}<span v-if="m.suffix" class="suffix">{{ m.suffix }}</span>
          </div>
          <div class="metric-foot">
            <span class="muted">{{ m.note }}</span>
            <span v-if="m.limit" class="muted right">{{ m.limit }}</span>
          </div>
        </div>
      </cds-card>
    </div>

    <div class="bottom">
      <div class="status-col">
        <cds-card>
          <div cds-layout="vertical p:md gap:sm" class="panel">
            <div cds-text="section" class="panel-title">实例状态分布</div>
            <div cds-layout="vertical p:lg align:horizontal-center" class="empty">
              <cds-icon shape="cpu" size="xl" class="empty-icon"></cds-icon>
              <span cds-text="body" class="muted">暂无实例</span>
            </div>
          </div>
        </cds-card>

        <cds-card>
          <div cds-layout="vertical p:md gap:sm" class="panel">
            <div class="panel-head">
              <div cds-text="section" class="panel-title">最近实例</div>
              <a class="link" href="#">查看全部</a>
            </div>
            <div cds-layout="vertical p:lg gap:xs align:horizontal-center" class="empty">
              <cds-icon shape="cpu" size="xl" class="empty-icon"></cds-icon>
              <span cds-text="body" class="muted">暂无实例</span>
              <a class="link" href="#">
                <cds-icon shape="plus-circle" size="sm"></cds-icon>
                立即创建
              </a>
            </div>
          </div>
        </cds-card>
      </div>

      <cds-card class="quickstart-card">
        <div cds-layout="vertical p:md gap:sm" class="panel qs-panel">
          <div class="qs-title">
            <cds-icon shape="pop-out" size="md" class="qs-icon"></cds-icon>
            <span cds-text="section">快速开始</span>
          </div>
          <div class="steps">
            <div v-for="s in steps" :key="s.num" class="step">
              <div class="step-num">第{{ ['一','二','三','四','五'][s.num - 1] }}步</div>
              <div class="step-body">
                <div class="step-title">{{ s.title }}</div>
                <div class="step-desc">{{ s.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </cds-card>
      
    </div>
  </section>
</template>




<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 100%;
}

.dash-header {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}
.heading {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 28px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
  margin: 0;
  line-height: 1.4;
}
.right { margin-left: auto; }

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  flex-shrink: 0;
}
.stats :deep(cds-card) {
  display: block;
  min-width: 0;
  width: 100%;
}
@media (max-width: 1100px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .stats { grid-template-columns: 1fr; }
}

.metric-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.metric-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
}
.metric-label {
  font-size: 13px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.metric-value {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.suffix {
  font-size: 16px;
  font-weight: 400;
  color: var(--cds-alias-typography-color-300, #565656);
  margin-left: 4px;
}
.metric-foot {
  display: flex;
  align-items: center;
  font-size: 12px;
  margin-top: auto;
}

.bottom {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(420px, 1.6fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}
@media (max-width: 900px) {
  .bottom { grid-template-columns: 1fr; }
}

.status-col {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 12px;
  min-height: 0;
}
.status-col :deep(cds-card) {
  display: block;
  min-width: 0;
  width: 100%;
}

.panel { height: 100%; }
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-title {
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.empty {
  flex: 1;
  justify-content: center;
  gap: 6px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.empty-icon {
  color: #b3b3b3;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  text-decoration: none;
  font-size: 13px;
}
.link:hover { text-decoration: underline; }

.quickstart-card :deep(cds-card),
.quickstart-card {
  display: block;
  min-width: 0;
  width: 100%;
  height: 100%;
}
.qs-panel { height: 100%; }
.qs-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.qs-icon { color: var(--cds-alias-object-app-foreground, #1b1b1b); }

.steps {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  flex: 1;
  min-height: 0;
}
@media (max-width: 1200px) { .steps { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 720px)  { .steps { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 420px)  { .steps { grid-template-columns: 1fr; } }

.step {
  background: #1a3a5c;
  color: #e8edf2;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.step-num {
  background: #1a3a5c;
  color: #c8d2dc;
  font-size: 11px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}
.step-body {
  background: #fafafa;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  padding: 8px;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.step-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 3px;
  line-height: 1.35;
}
.step-desc {
  font-size: 11px;
  color: var(--cds-alias-typography-color-300, #565656);
  line-height: 1.45;
}
</style>
