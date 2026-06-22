import { ref } from 'vue'
import { defineStore } from 'pinia'

export type Locale = 'zh' | 'en'
const STORAGE_KEY = 'clarity-locale'

type Dict = Record<string, { zh: string; en: string }>

const STRINGS: Dict = {
  'app.title':         { zh: '智能体管理平台',             en: 'Agent Management Platform' },
  'app.brand':         { zh: '智能体管理平台',             en: 'Agent Management Platform' },
  'nav.dashboard':     { zh: '仪表盘',                    en: 'Dashboard' },
  'nav.agents':        { zh: '智能体',                    en: 'Agents' },
  'nav.knowledge':     { zh: '知识库',                    en: 'Knowledge Base' },
  'nav.logs':          { zh: '对话日志',                  en: 'Conversation Logs' },
  'nav.settings':      { zh: '系统设置',                  en: 'Settings' },
  'user.profile':      { zh: '个人资料',                  en: 'Profile' },
  'user.logout':       { zh: '退出登录',                  en: 'Log out' },
  'theme.light':       { zh: '浅色',                      en: 'Light' },
  'theme.dark':        { zh: '深色',                      en: 'Dark' },
  'lang.zh':           { zh: '中文',                      en: 'Chinese' },
  'lang.en':           { zh: '英文',                      en: 'English' },
  'dashboard.title':   { zh: '仪表盘',                    en: 'Dashboard' },
  'dashboard.welcome': { zh: '欢迎回来',                  en: 'Welcome back' },
  'dashboard.stat.agents':    { zh: '智能体数量',         en: 'Active Agents' },
  'dashboard.stat.sessions':  { zh: '今日对话',           en: 'Today’s Sessions' },
  'dashboard.stat.knowledge': { zh: '知识库文档',         en: 'Knowledge Documents' },
  'dashboard.stat.uptime':    { zh: '服务可用性',         en: 'Service Uptime' },
  'coming.soon':       { zh: '即将推出',                  en: 'Coming soon' },
  'coming.soon.desc':  { zh: '该模块正在建设中，请稍后查看。', en: 'This module is under construction. Check back soon.' },
  'login.tagline':     { zh: '一站式管理企业 AI 智能体 — 从资源接入、模型路由到全链路观测与治理,让 AI 在生产中可管、可控、可观测。', en: 'Manage enterprise AI agents end-to-end — from resource provisioning and model routing to full-stack observability and governance. Built for production-grade AI.' },
  'login.copyright':   { zh: '© 智能体管理平台',          en: '© Agent Management Platform' },
  'about.title':        { zh: '关于智能体管理平台',        en: 'About Agent Management Platform' },
  'about.menu':         { zh: '关于',                      en: 'About' },
  'about.version':      { zh: '版本',                      en: 'Version' },
  'about.tagline':      { zh: '一站式管理企业 AI 智能体 — 从资源接入、模型路由到全链路观测与治理,让 AI 在生产中可管、可控、可观测。', en: 'Manage enterprise AI agents end-to-end — from resource provisioning and model routing to full-stack observability and governance. Built for production-grade AI.' },
  'about.copyright':    { zh: '© 智能体管理平台 · 保留所有权利', en: '© Agent Management Platform. All rights reserved.' },
  'about.close':        { zh: '关闭',                      en: 'Close' },
  'login.heading':     { zh: '登录',                      en: 'Sign in' },
  'login.email':       { zh: '邮箱',                      en: 'Email' },
  'login.password':    { zh: '密码',                      en: 'Password' },
  'login.remember':    { zh: '记住我',                    en: 'Remember me' },
  'login.submit':      { zh: '登录',                      en: 'Sign in' },
  'login.error.email': { zh: '请输入有效的邮箱地址',      en: 'Enter a valid email address.' },
  'login.error.password': { zh: '请输入密码',             en: 'Password is required.' },
  'login.error.creds': { zh: '邮箱或密码错误',            en: 'Invalid email or password.' },
  'agents.list.title':     { zh: '智能体列表',         en: 'Agent List' },
  'agents.list.export':    { zh: '导出列表',           en: 'Export' },
  'agents.export.success': { zh: '已导出 {count} 项',   en: 'Exported {count} agents' },
  'agents.export.fail':    { zh: '导出失败',           en: 'Export failed' },
  'agents.list.batch':     { zh: '批量操作',           en: 'Batch Actions' },
  'agents.list.refresh':   { zh: '刷新',               en: 'Refresh' },
  'agents.col.select':     { zh: '',                   en: '' },
  'agents.col.name':       { zh: '名称',               en: 'Name' },
  'agents.col.type':       { zh: '智能体类型',         en: 'Agent Type' },
  'agents.col.status':     { zh: '状态',               en: 'Status' },
  'agents.col.key':        { zh: '密钥名称',           en: 'Key Name' },
  'agents.col.owner':      { zh: '用户',               en: 'Owner' },
  'agents.col.actions':    { zh: '操作',               en: 'Actions' },
  'agents.status.running': { zh: '运行中',             en: 'Running' },
  'agents.status.stopped': { zh: '已停止',             en: 'Stopped' },
  'agents.status.error':   { zh: '异常',               en: 'Error' },
  'agents.status.filter.all':     { zh: '全部状态',     en: 'All statuses' },
  'agents.type.filter.all':       { zh: '全部类型',     en: 'All types' },
  'agents.type.python-automation':{ zh: 'Python自动化',  en: 'Python Automation' },
  'agents.type.general-chat':     { zh: '通用聊天',      en: 'General Conversation' },
  'agents.type.code-analysis':    { zh: '代码解析',      en: 'Code Analysis' },
  'agents.type.data-analysis':    { zh: '数据分析',      en: 'Data Analysis' },
  'agents.type.image-generation': { zh: '图像生成',      en: 'Image Generation' },
  'agents.action.visit':      { zh: '访问信息',         en: 'Visit Info' },
  'agents.action.configure':  { zh: '配置',             en: 'Configure' },
  'agents.action.more':       { zh: '更多',             en: 'More' },
  'agents.action.rotateKey':  { zh: '密码更新',         en: 'Rotate Key' },
  'agents.action.restart':    { zh: '重启',             en: 'Restart' },
  'agents.action.stop':       { zh: '停止',             en: 'Stop' },
  'agents.action.update':     { zh: '版本更新',         en: 'Version Update' },
  'agents.action.delete':     { zh: '删除',             en: 'Delete' },
  'agents.action.copyKey':    { zh: '复制密码',         en: 'Copy key' },
  'agents.action.copyKeyOk':  { zh: '已复制 "{name}"',  en: 'Copied "{name}"' },
  'agents.action.copyKeyFail':{ zh: '复制失败',          en: 'Copy failed' },
  'agents.action.sortAsc':    { zh: '升序',             en: 'Ascending' },
  'agents.action.sortDesc':   { zh: '降序',             en: 'Descending' },
  'agents.batch.start':       { zh: '批量启动',         en: 'Start Selected' },
  'agents.batch.stop':        { zh: '批量停止',         en: 'Stop Selected' },
  'agents.batch.update':      { zh: '批量更新',         en: 'Update Selected' },
  'agents.batch.delete':      { zh: '批量删除',         en: 'Delete Selected' },
  'agents.batch.disabled':    { zh: '请先选择智能体',    en: 'Select agents first' },
  'agents.toolbar.selected':  { zh: '已选 {count} 项',     en: '{count} selected' },
  'agents.col.name.search':   { zh: '搜索名称',            en: 'Search name' },
  'agents.col.key.search':    { zh: '搜索密钥名称',         en: 'Search key' },
  'agents.col.owner.search':  { zh: '搜索用户',             en: 'Search owner' },
  'agents.footer.summary':    { zh: '显示 {start}-{end} 条,共 {total} 条', en: 'Showing {start}-{end} of {total}' },
  'agents.pager.first':       { zh: '首页',             en: 'First page' },
  'agents.pager.prev':        { zh: '上一页',           en: 'Previous page' },
  'agents.pager.next':        { zh: '下一页',           en: 'Next page' },
  'agents.pager.last':        { zh: '末页',             en: 'Last page' },
  'agents.pager.page':        { zh: '当前页',           en: 'Page' },
  'agents.pager.pageSize':    { zh: '每页条数',         en: 'Per page' },
  'agents.pager.label':       { zh: '分页',             en: 'Pagination' },
  'agents.empty':             { zh: '暂无数据',         en: 'No data' },
  'agents.loading':           { zh: '加载中…',           en: 'Loading…' },
  'agents.error':             { zh: '加载失败',         en: 'Failed to load' },
}

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<Locale>('zh')

  function t(key: string): string {
    const entry = STRINGS[key]
    if (!entry) return key
    return entry[locale.value]
  }

  function setLocale(next: Locale) {
    locale.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', next === 'zh' ? 'zh-CN' : 'en')
    }
  }

  function init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'zh' || stored === 'en') {
        locale.value = stored
      }
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', locale.value === 'zh' ? 'zh-CN' : 'en')
    }
  }

  return { locale, t, setLocale, init }
})
