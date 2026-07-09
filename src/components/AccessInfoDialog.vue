<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import type { Agent } from '@/types/agents'

const props = defineProps<{
  open: boolean
  agent: Agent | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'retry'): void
}>()

const toast = useToast()

const showPassword = ref(false)
const keyExpanded = ref(true)
const credsExpanded = ref(true)

const creds = computed(() => props.agent?.credentials)
const apiKeyName = computed(() => props.agent?.apiKey?.name || '')
const sshCmd = computed(() => creds.value?.sshCommand || '')
const ip = computed(() => creds.value?.ip || '')
const username = computed(() => creds.value?.username || '')
const passwordHint = computed(() => creds.value?.passwordHint || '')

function toggleSection(section: 'key' | 'creds') {
  if (section === 'key') keyExpanded.value = !keyExpanded.value
  else credsExpanded.value = !credsExpanded.value
}

async function copyText(text: string, label: string) {
  if (!text) return
  const fallbackCopy = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopy()
    }
    toast.success(`${label} 已复制`)
  } catch {
    // Clipboard API can throw on HTTP origins — fall back to execCommand
    try { fallbackCopy(); toast.success(`${label} 已复制`) }
    catch { toast.error('复制失败，请手动选择文本复制') }
  }
}

/** Build a formatted multi-line credential block and copy all at once. */
async function copyAll() {
  const lines: string[] = []
  if (apiKeyName.value) lines.push(`密钥名称: ${apiKeyName.value}`)
  if (username.value) lines.push(`OS账户: ${username.value}`)
  if (passwordHint.value) lines.push(`登录密码: ${passwordHint.value}`)
  if (sshCmd.value) lines.push(`SSH 连接: ${sshCmd.value}`)
  if (ip.value) lines.push(`IP 地址: ${ip.value}`)
  if (!lines.length) {
    toast.error('无凭据可复制')
    return
  }
  const text = lines.join('\n')
  const fallbackCopy = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopy()
    }
    toast.success('全部凭据已复制')
  } catch {
    try { fallbackCopy(); toast.success('全部凭据已复制') }
    catch { toast.error('复制失败，请手动选择文本复制') }
  }
}
</script>

<template>
  <cds-modal :hidden="!props.open" size="md" @closeChange="emit('close')">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ props.agent?.name || '' }} 访问信息
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <!-- Loading -->
      <div v-if="loading" class="access-loading">
        <cds-icon shape="spinner" size="lg" class="spin"></cds-icon>
        <p>正在从 vCenter 拉取虚拟机凭据...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="access-error">
        <cds-alert status="danger">
          <cds-alert-content>
            <p>{{ error }}</p>
            <cds-button size="sm" @click="emit('retry')">重试</cds-button>
          </cds-alert-content>
        </cds-alert>
      </div>

      <!-- Content -->
      <div v-else class="access-content">
        <!-- Section 1: API Key -->
        <div class="accordion-section">
          <button
            type="button"
            class="accordion-trigger"
            :aria-expanded="keyExpanded"
            @click="toggleSection('key')"
          >
            <cds-icon
              :shape="keyExpanded ? 'angle' : 'angle'"
              :direction="keyExpanded ? 'down' : 'right'"
              size="sm"
              class="accordion-arrow"
            ></cds-icon>
            <span class="accordion-label">密钥信息</span>
          </button>
          <div v-show="keyExpanded" class="accordion-body">
            <div class="cred-row">
              <label>密钥名称</label>
              <div class="cred-value">
                <span>{{ apiKeyName || '—' }}</span>
                <cds-button-action
                  v-if="apiKeyName"
                  shape="copy"
                  title="复制密钥名称"
                  @click="copyText(apiKeyName, '密钥名称')"
                ></cds-button-action>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 2: VM Credentials -->
        <div class="accordion-section">
          <button
            type="button"
            class="accordion-trigger"
            :aria-expanded="credsExpanded"
            @click="toggleSection('creds')"
          >
            <cds-icon
              :shape="credsExpanded ? 'angle' : 'angle'"
              :direction="credsExpanded ? 'down' : 'right'"
              size="sm"
              class="accordion-arrow"
            ></cds-icon>
            <span class="accordion-label">虚拟机访问凭据</span>
          </button>
          <div v-show="credsExpanded" class="accordion-body">
            <!-- Run-as User -->
            <div class="cred-row">
              <label>OS账户</label>
              <div class="cred-value">
                <span>{{ username || '—' }}</span>
                <cds-button-action
                  v-if="username"
                  shape="copy"
                  title="复制OS账户"
                  @click="copyText(username, 'OS账户')"
                ></cds-button-action>
              </div>
            </div>

            <!-- Password -->
            <div class="cred-row">
              <label>登录密码</label>
              <div class="cred-value">
                <span class="pw-text">{{ showPassword ? passwordHint : '••••••••' }}</span>
                <cds-button-action
                  v-if="true"
                  :shape="showPassword ? 'eye-hide' : 'eye'"
                  :title="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                ></cds-button-action>
                <cds-button-action
                  v-if="true"
                  shape="copy"
                  title="复制密码"
                  @click="copyText(passwordHint, '登录密码')"
                ></cds-button-action>
              </div>
            </div>

            <!-- SSH Command -->
            <div class="cred-row">
              <label>SSH 连接</label>
              <div class="cred-value">
                <code>{{ sshCmd || '—' }}</code>
                <cds-button-action
                  v-if="sshCmd"
                  shape="copy"
                  title="复制 SSH 命令"
                  @click="copyText(sshCmd, 'SSH 连接')"
                ></cds-button-action>
              </div>
            </div>

            <!-- IP -->
            <div class="cred-row">
              <label>IP 地址</label>
              <div class="cred-value">
                <span class="mono">{{ ip || '—' }}</span>
                <cds-button-action
                  v-if="ip"
                  shape="copy"
                  title="复制 IP 地址"
                  @click="copyText(ip, 'IP 地址')"
                ></cds-button-action>
              </div>
            </div>

            <!-- Copy All -->
            <div class="copy-all-row">
              <cds-button size="sm" @click="copyAll">
                <cds-icon shape="copy" size="sm" aria-hidden="true"></cds-icon>
                一键复制全部凭据
              </cds-button>
            </div>
          </div>
        </div>

        <!-- Warning -->
        <cds-alert status="warning" class="access-warning">
          <cds-alert-content>
            密码由部署时设定，平台不存储明文。如遗忘请通过 vCenter Console 重置。
          </cds-alert-content>
        </cds-alert>
      </div>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" @click="emit('close')">关闭</cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
/* ---------- Title ---------- */
.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

/* ---------- States ---------- */
.access-loading {
  text-align: center;
  padding: 48px 0;
}
.access-loading p {
  margin-top: 16px;
  color: #86909c;
  font-size: 14px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.access-error {
  padding: 8px 0;
}

/* ---------- Accordion ---------- */
.accordion-section {
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
}
.accordion-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: #f7f8fa;
  border: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.15s;
}
.accordion-trigger:hover {
  background: #eef0f4;
}
.accordion-arrow {
  flex-shrink: 0;
  transition: transform 0.2s;
  color: #86909c;
}
.accordion-label {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
}
.accordion-body {
  padding: 4px 16px 12px;
}

/* ---------- Credential Rows ---------- */
.cred-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f2f3f5;
}
.cred-row:last-of-type {
  border-bottom: none;
}
.cred-row label {
  flex: 0 0 80px;
  font-size: 14px;
  font-weight: 500;
  color: #4e5969;
}
.cred-value {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.cred-value code {
  background: #f2f3f5;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  word-break: break-all;
}
.cred-value span {
  font-size: 14px;
  word-break: break-all;
}
.mono {
  font-family: 'SF Mono', 'Fira Code', monospace;
}
.pw-text {
  font-family: monospace;
}

/* ---------- Copy All ---------- */
.copy-all-row {
  padding: 12px 0 4px;
  border-top: 1px dashed #e5e6eb;
  margin-top: 8px;
}

/* ---------- Warning ---------- */
.access-warning {
  margin-top: 12px;
}
</style>
