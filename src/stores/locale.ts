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

  /* ============================================================
   * User & Role Management — see plan §Locale 新增键
   * zh-only per project rule #2 (中文 only).
   * ============================================================ */

  // Page-level
  'users.title':              { zh: '用户与权限',        en: '' },
  'users.tabs.users':         { zh: '用户管理',          en: '' },
  'users.tabs.roles':         { zh: '角色与权限',        en: '' },

  // Toolbar
  'users.toolbar.create':     { zh: '新建用户',          en: '' },
  'roles.toolbar.refresh':    { zh: '刷新',              en: '' },

  // Users table columns
  'users.col.username':       { zh: '用户名',            en: '' },
  'users.col.role':           { zh: '角色',              en: '' },
  'users.col.email':          { zh: '邮箱',              en: '' },
  'users.col.connection':     { zh: '连接状态',          en: '' },
  'users.col.lastLogin':      { zh: '上次登录',          en: '' },
  'users.col.createdAt':      { zh: '创建时间',          en: '' },
  'users.col.updatedAt':      { zh: '更新时间',          en: '' },
  'users.col.actions':        { zh: '操作',              en: '' },

  // Column filter dropdowns
  'users.col.filter.usernamePlaceholder': { zh: '输入关键字筛选用户名', en: '' },
  'users.col.filter.rolePlaceholder':     { zh: '输入关键字筛选角色',   en: '' },
  'users.col.filter.emailPlaceholder':    { zh: '输入关键字筛选邮箱',   en: '' },
  'users.col.filter.statusAll':           { zh: '全部',                 en: '' },
  'users.col.filter.statusOnline':        { zh: '在线',                 en: '' },
  'users.col.filter.statusOffline':       { zh: '离线',                 en: '' },
  'users.col.filter.apply':               { zh: '应用',                 en: '' },
  'users.col.filter.clear':               { zh: '清空',                 en: '' },
  'users.col.sort':                       { zh: '排序',                 en: '' },
  'users.col.filter':                     { zh: '过滤',                 en: '' },

  // Connection-status badges
  'users.status.online':      { zh: '在线',              en: '' },
  'users.status.offline':     { zh: '离线',              en: '' },

  // Per-row actions (no `edit` per spec)
  'users.action.resetPwd':    { zh: '重置密码',          en: '' },
  'users.action.bindRole':    { zh: '绑定角色',          en: '' },
  'users.action.disable':     { zh: '禁用',              en: '' },
  'users.action.enable':      { zh: '启用',              en: '' },
  'users.action.delete':      { zh: '删除',              en: '' },

  // User form (create only)
  'users.form.title.create':  { zh: '新建用户',          en: '' },
  'users.form.username':      { zh: '用户名',            en: '' },
  'users.form.displayName':   { zh: '显示名',            en: '' },
  'users.form.email':         { zh: '邮箱',              en: '' },
  'users.form.role':          { zh: '角色',              en: '' },
  'users.form.enabled':       { zh: '启用账户',          en: '' },
  'users.form.passwordMode':  { zh: '密码',              en: '' },
  'users.form.passwordMode.auto':   { zh: '自动生成',      en: '' },
  'users.form.passwordMode.custom': { zh: '自定义',        en: '' },
  'users.form.customPassword':      { zh: '密码',          en: '' },
  'users.form.confirmPassword':    { zh: '确认密码',      en: '' },
  'users.form.passwordMismatch':    { zh: '两次输入的密码不一致', en: '' },
  'users.form.passwordHint':        { zh: '密码须包含大小写字母、数字、特殊符号,长度 ≥ 10', en: '' },
  'users.form.submit':              { zh: '创建',          en: '' },
  'users.form.cancel':              { zh: '取消',          en: '' },
  'users.form.username.required':   { zh: '请输入用户名',  en: '' },
  'users.form.email.invalid':       { zh: '请输入有效的邮箱地址', en: '' },
  'users.form.username.taken':      { zh: '该用户名已被使用', en: '' },
  'users.form.email.taken':         { zh: '该邮箱已被使用',   en: '' },
  'users.form.username.checking':   { zh: '正在检查用户名可用性…', en: '' },
  'users.form.email.checking':      { zh: '正在检查邮箱可用性…',   en: '' },

  // Page-level empty / loading / error
  'users.empty':              { zh: '暂无用户',          en: '' },
  'users.loading':            { zh: '加载中…',            en: '' },
  'users.error':              { zh: '加载失败',          en: '' },

  // Toasts
  'users.toast.createOk':     { zh: '已创建用户 {name}', en: '' },
  'users.toast.createFail':   { zh: '创建失败',          en: '' },
  'users.toast.deleteOk':     { zh: '已删除用户 {name}', en: '' },
  'users.toast.deleteFail':   { zh: '删除失败',          en: '' },
  'users.toast.resetPwdOk':   { zh: '密码已重置:新密码已生成并显示', en: '' },
  'users.toast.resetPwdFail': { zh: '密码重置失败',      en: '' },
  'users.toast.bindOk':       { zh: '已为 {count} 个用户绑定角色', en: '' },
  'users.toast.bindFail':     { zh: '绑定失败',          en: '' },
  'users.toast.disableOk':    { zh: '已禁用 {name}',     en: '' },
  'users.toast.enableOk':     { zh: '已启用 {name}',     en: '' },
  'users.toast.toggleFail':   { zh: '操作失败',          en: '' },
  'users.toast.duplicateUsername': { zh: '用户名已存在',  en: '' },
  'users.toast.duplicateEmail':    { zh: '邮箱已被使用',  en: '' },
  'users.toast.passwordCopied':    { zh: '已复制到剪贴板', en: '' },

  // Confirm dialogs
  'users.confirm.delete.title':  { zh: '确认删除用户',    en: '' },
  'users.confirm.delete.body':   { zh: '确定要删除用户 {name} 吗?此操作不可撤销。', en: '' },
  'users.confirm.reset.title':   { zh: '确认重置密码',    en: '' },
  'users.confirm.reset.body':    { zh: '将为 {name} 生成新的随机密码,确认继续?', en: '' },
  'users.confirm.disable.title': { zh: '确认禁用用户',    en: '' },
  'users.confirm.disable.body':  { zh: '禁用后,{name} 将无法登录。是否继续?', en: '' },
  'users.confirm.bind.title':    { zh: '确认绑定角色',    en: '' },
  'users.confirm.bind.body':     { zh: '将为 {count} 个用户绑定该角色,确认继续?', en: '' },

  // Bind-role dialog
  'users.bind.title':            { zh: '绑定用户与角色',  en: '' },
  'users.bind.role':             { zh: '选择角色',        en: '' },
  'users.bind.users':            { zh: '选择用户',        en: '' },
  'users.bind.submit':           { zh: '保存',            en: '' },
  'users.bind.cancel':           { zh: '取消',            en: '' },
  'users.bind.empty':            { zh: '至少选择 1 个用户', en: '' },

  // Password reveal dialog (one-shot)
  'users.passwordReveal.title':  { zh: '{name} 的初始密码', en: '' },
  'users.passwordReveal.warning':{ zh: '此密码仅显示一次,请立即复制并安全保存。关闭后无法再次查看。', en: '' },
  'users.passwordReveal.copy':    { zh: '复制密码',          en: '' },
  'users.passwordReveal.close':   { zh: '我已保存,关闭',     en: '' },

  // Role-users dialog (read-only)
  'users.roleUsers.title':       { zh: '{name} 的用户',  en: '' },
  'users.roleUsers.col.username':{ zh: '用户名',          en: '' },
  'users.roleUsers.col.email':   { zh: '邮箱',            en: '' },
  'users.roleUsers.col.connection': { zh: '连接状态',      en: '' },
  'users.roleUsers.col.lastLogin':  { zh: '上次登录',      en: '' },
  'users.roleUsers.empty':       { zh: '该角色下暂无用户', en: '' },
  'users.roleUsers.close':       { zh: '关闭',            en: '' },

  // Roles tab
  'roles.col.name':             { zh: '角色名称',        en: '' },
  'roles.col.description':      { zh: '描述',            en: '' },
  'roles.col.userCount':        { zh: '用户数',          en: '' },
  'roles.col.actions':          { zh: '操作',            en: '' },
  'roles.action.delete':        { zh: '删除',            en: '' },
  'roles.action.deleteDisabledHint': { zh: '预定义角色不可删除', en: '' },
  'roles.empty':                { zh: '暂无角色',        en: '' },
  'roles.loading':              { zh: '加载中…',          en: '' },
  'roles.error':                { zh: '加载失败',        en: '' },
  'roles.toast.deleteOk':       { zh: '已删除角色 {name}', en: '' },
  'roles.toast.deleteFail':     { zh: '删除失败',        en: '' },
  'roles.confirm.delete.title': { zh: '确认删除角色',    en: '' },
  'roles.confirm.delete.body':  { zh: '确定要删除角色 {name} 吗?此操作不可撤销。', en: '' },

  // Generic
  'common.confirm':             { zh: '确认',            en: '' },
  'common.cancel':              { zh: '取消',            en: '' },

  /* ============================================================
   * Resource Pool Access — see plan
   * `资源池接入页面 (/platform/resources)`
   * zh-only per project rule.
   * ============================================================ */
  'resources.title':                  { zh: '资源池接入管理',      en: '' },
  'resources.toolbar.create':         { zh: '接入资源池',          en: '' },
  'resources.toolbar.search':         { zh: '搜索资源池名称或 Endpoint', en: '' },

  'resources.col.name':              { zh: '资源池名称',          en: '' },
  'resources.col.endpoint':          { zh: '地址',                  en: '' },
  'resources.col.status':            { zh: '同步状态',            en: '' },
  'resources.col.syncStatus':        { zh: '同步状态',            en: '' },
  'resources.col.datacenter':        { zh: '数据中心数',          en: '' },
  'resources.col.cluster':           { zh: '集群数',              en: '' },
  'resources.col.createdAt':         { zh: '创建时间',            en: '' },
  'resources.col.updatedAt':         { zh: '更新时间',            en: '' },
  'resources.col.actions':           { zh: '操作',                en: '' },

  'resources.col.name.search':       { zh: '搜索资源池名称',      en: '' },
  'resources.col.endpoint.search':   { zh: '搜索 Endpoint',       en: '' },

  'resources.status.connected':      { zh: '已连接',              en: '' },
  'resources.status.disconnected':   { zh: '未连接',              en: '' },
  'resources.status.filter.all':     { zh: '全部状态',            en: '' },
  'resources.status.synced':         { zh: '已同步',              en: '' },
  'resources.status.neverSynced':    { zh: '未同步',              en: '' },
  'resources.status.syncedAgo':      { zh: '{ago}已同步',          en: '' },

  'resources.action.manage':         { zh: '管理',                en: '' },
  'resources.action.sync':           { zh: '同步数据',            en: '' },
  'resources.action.edit':           { zh: '编辑',                en: '' },
  'resources.action.delete':         { zh: '删除接入',            en: '' },

  'resources.empty':                 { zh: '暂无资源池',          en: '' },
  'resources.loading':               { zh: '加载中…',              en: '' },
  'resources.error':                 { zh: '加载失败',            en: '' },

  'resources.footer.syncStatus.title':   { zh: '当前同步状态',  en: '' },
  'resources.footer.syncStatus.summary': { zh: '资源池 vCenter_OC1 连接成功,屏幕提示不可连接成功。', en: '' },

  // Toasts
  'resources.toast.createOk':       { zh: '已创建资源池 {name}', en: '' },
  'resources.toast.createFail':     { zh: '创建失败',            en: '' },
  'resources.toast.updateOk':       { zh: '已保存资源池 {name}', en: '' },
  'resources.toast.updateFail':     { zh: '保存失败',            en: '' },
  'resources.toast.deleteOk':       { zh: '已删除资源池 {name}', en: '' },
  'resources.toast.deleteFail':     { zh: '删除失败',            en: '' },
  'resources.toast.syncOk':         { zh: '已同步资源池 {name}', en: '' },
  'resources.toast.syncFail':       { zh: '同步失败',            en: '' },

  // Form dialog (create / edit)
  'resources.form.title.create':    { zh: '接入资源池',          en: '' },
  'resources.form.title.edit':      { zh: '编辑资源池',          en: '' },
  'resources.form.name':            { zh: '资源池名称',          en: '' },
  'resources.form.endpoint':        { zh: 'Endpoint',            en: '' },
  'resources.form.datacenter':      { zh: '数据中心数',          en: '' },
  'resources.form.cluster':         { zh: '集群数',              en: '' },
  'resources.form.submit':          { zh: '保存',                en: '' },

  // Confirm dialog
  'resources.confirm.delete.title': { zh: '确认删除资源池',      en: '' },
  'resources.confirm.delete.body':  { zh: '确定要删除资源池 {name} 吗?此操作不可撤销。', en: '' },

  'gateway.breadcrumb.label': { zh: '面包屑导航', en: 'Breadcrumb' },
  'gateway.breadcrumb.system': { zh: '系统配置', en: 'System Configuration' },
  'gateway.breadcrumb.current': { zh: '模型网关接入', en: 'Model Gateway Integration' },
  'gateway.title': { zh: '模型网关接入管理', en: 'Model Gateway Integration' },
  'gateway.description': {
    zh: '配置并管理 LiteLLM 等大模型网关的接入。',
    en: 'Connect and manage LiteLLM model gateways.',
  },
  'gateway.connectButton': { zh: '接入模型网关', en: 'Connect Gateway' },
  'gateway.search': { zh: '搜索名称或 Endpoint', en: 'Search name or endpoint' },
  'gateway.filter.status': { zh: '状态', en: 'Status' },
  'gateway.filter.all': { zh: '全部状态', en: 'All statuses' },
  'gateway.table.label': { zh: '模型网关列表', en: 'Model gateways' },
  'gateway.col.name': { zh: '网关名称', en: 'Gateway Name' },
  'gateway.col.endpoint': { zh: 'Endpoint', en: 'Endpoint' },
  'gateway.col.status': { zh: '连接状态', en: 'Status' },
  'gateway.col.sync': { zh: '同步状态', en: 'Sync Status' },
  'gateway.col.models': { zh: '后端模型数', en: 'Models' },
  'gateway.col.strategy': { zh: '负载均衡策略', en: 'Load Balancing' },
  'gateway.col.latency': { zh: '响应时间(ms)', en: 'Latency (ms)' },
  'gateway.col.actions': { zh: '操作', en: 'Actions' },
  'gateway.status.connected': { zh: '已连接', en: 'Connected' },
  'gateway.status.disconnected': { zh: '未连接', en: 'Disconnected' },
  'gateway.status.error': { zh: '异常', en: 'Error' },
  'gateway.strategy.roundRobin': { zh: '轮询', en: 'Round Robin' },
  'gateway.action.copy': { zh: '复制网关名称', en: 'Copy gateway name' },
  'gateway.action.test': { zh: '测试连接', en: 'Test' },
  'gateway.action.manage': { zh: '管理配置', en: 'Manage' },
  'gateway.action.edit': { zh: '编辑接入', en: 'Edit' },
  'gateway.action.delete': { zh: '删除接入', en: 'Delete' },
  'gateway.action.refresh': { zh: '刷新', en: 'Refresh' },
  'gateway.action.cancel': { zh: '取消', en: 'Cancel' },
  'gateway.action.save': { zh: '保存更改', en: 'Save Changes' },
  'gateway.action.connect': { zh: '确认接入', en: 'Connect' },
  'gateway.loading': { zh: '正在加载模型网关…', en: 'Loading model gateways…' },
  'gateway.empty': { zh: '暂无模型网关接入', en: 'No model gateways connected' },
  'gateway.error.load': {
    zh: '模型网关加载失败，请检查后端服务或切换到 Fixture 模式。',
    en: 'Failed to load model gateways. Check the backend or enable fixture mode.',
  },
  'gateway.pagination.summary': {
    zh: '显示 {start}-{end} 条，共 {total} 条',
    en: 'Showing {start}-{end} of {total}',
  },
  'gateway.pagination.label': { zh: '模型网关分页', en: 'Model gateway pagination' },
  'gateway.pagination.page': { zh: '当前页', en: 'Current page' },
  'gateway.pagination.pageSize': { zh: '每页条数', en: 'Per page' },
  'gateway.form.createTitle': { zh: '接入 LiteLLM 模型网关', en: 'Connect LiteLLM Gateway' },
  'gateway.form.editTitle': { zh: '编辑模型网关接入', en: 'Edit Model Gateway' },
  'gateway.form.provider': { zh: '网关类型', en: 'Gateway Type' },
  'gateway.form.name': { zh: '网关名称', en: 'Gateway Name' },
  'gateway.form.namePlaceholder': { zh: '例如 LiteLLM_Router_1', en: 'e.g. LiteLLM_Router_1' },
  'gateway.form.nameError': {
    zh: '名称长度应为 2–64 个字符。',
    en: 'Name must be 2–64 characters.',
  },
  'gateway.form.endpoint': { zh: 'Endpoint', en: 'Endpoint' },
  'gateway.form.adminUrl': { zh: '后端管理页 URL（可选）', en: 'Admin URL (optional)' },
  'gateway.form.urlError': {
    zh: '请输入有效的 HTTP 或 HTTPS URL。',
    en: 'Enter a valid HTTP or HTTPS URL.',
  },
  'gateway.form.masterKey': { zh: 'LiteLLM Master Key', en: 'LiteLLM Master Key' },
  'gateway.form.masterKeyPlaceholder': { zh: '请输入 Master Key', en: 'Enter master key' },
  'gateway.form.masterKeyEditHint': { zh: '留空表示不更新', en: 'Leave blank to keep unchanged' },
  'gateway.form.masterKeyError': {
    zh: '首次接入必须填写 Master Key。',
    en: 'Master key is required when connecting a gateway.',
  },
  'gateway.form.strategy': { zh: '负载均衡策略', en: 'Load-balancing strategy' },
  'gateway.form.secretNote': {
    zh: 'Master Key 仅随本次请求安全提交，不会回显或保存在浏览器中。',
    en: 'The master key is sent only with this request and is never displayed or stored in the browser.',
  },
  'gateway.delete.title': { zh: '删除模型网关接入', en: 'Delete Model Gateway' },
  'gateway.delete.message': { zh: '确定删除“{name}”吗？', en: 'Delete “{name}”?' },
  'gateway.delete.warning': {
    zh: '删除后该网关将停止同步，且此操作无法撤销。',
    en: 'Synchronization will stop and this action cannot be undone.',
  },
  'gateway.toast.copied': { zh: '已复制“{name}”', en: 'Copied “{name}”' },
  'gateway.toast.copyFailed': { zh: '复制失败', en: 'Copy failed' },
  'gateway.toast.testSuccess': {
    zh: '“{name}”连接测试成功',
    en: 'Connection test succeeded for “{name}”',
  },
  'gateway.toast.testFailed': { zh: '连接测试失败', en: 'Connection test failed' },
  'gateway.toast.noAdminUrl': {
    zh: '该网关未配置后端管理页 URL',
    en: 'No admin URL is configured for this gateway',
  },
  'gateway.toast.created': { zh: '模型网关接入已创建', en: 'Model gateway connected' },
  'gateway.toast.updated': { zh: '模型网关配置已更新', en: 'Model gateway updated' },
  'gateway.toast.saveFailed': { zh: '模型网关保存失败', en: 'Failed to save model gateway' },
  'gateway.toast.deleted': { zh: '模型网关接入已删除', en: 'Model gateway deleted' },
  'gateway.toast.deleteFailed': { zh: '模型网关删除失败', en: 'Failed to delete model gateway' },
  'gateway.sync.title': { zh: '当前同步状态', en: 'Current Synchronization Status' },
  'gateway.sync.description': {
    zh: '平台自动与 LiteLLM 网关同步模型目录、轮询策略和连接状态。',
    en: 'The platform synchronizes model catalogs, routing policies, and connection states with LiteLLM.',
  },
  'gateway.sync.last': { zh: '最近同步', en: 'Last synchronized' },
  'gateway.sync.success': { zh: '同步成功', en: 'Succeeded' },
  'gateway.sync.failed': { zh: '需要处理', en: 'Needs attention' },
  'gateway.sync.logTitle': { zh: '同步日志概要', en: 'Synchronization Summary' },
  'gateway.sync.summary': { zh: '{success} 个网关同步成功，{failed} 个网关需要处理。', en: '{success} gateway(s) synchronized; {failed} need attention.' },
  'gateway.sync.noLog': { zh: '暂无同步日志。', en: 'No synchronization log yet.' },
  'gateway.sync.never': { zh: '尚未同步', en: 'Never' },
  'gateway.sync.synchronized': { zh: '同步', en: 'Synced' },
  'gateway.sync.notSynchronized': { zh: '不同步', en: 'Not synced' },
  'gateway.sync.state.synced': { zh: '同步正常', en: 'Synchronized' },
  'gateway.sync.state.syncing': { zh: '同步中', en: 'Synchronizing' },
  'gateway.sync.state.partial': { zh: '部分异常', en: 'Partially synchronized' },
  'gateway.sync.state.failed': { zh: '同步失败', en: 'Failed' },
  'gateway.sync.state.never': { zh: '尚未同步', en: 'Never synchronized' }
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
