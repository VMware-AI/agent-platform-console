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
