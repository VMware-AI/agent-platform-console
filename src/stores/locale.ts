import { ref } from 'vue'
import { defineStore } from 'pinia'

export type Locale = 'zh' | 'en'
const STORAGE_KEY = 'clarity-locale'

type Dict = Record<string, { zh: string; en: string }>

// Exported as the single source of truth for the locale dictionary so contract
// tests (src/stores/__tests__/locale-*.test.ts) can assert i18n completeness,
// enum→key coverage, and locale integrity without duplicating the keys.
export const STRINGS: Dict = {
  'app.title': { zh: '智能体管理平台', en: 'Agent Management Platform' },
  'app.brand': { zh: '智能体管理平台', en: 'Agent Management Platform' },
  'nav.dashboard': { zh: '仪表盘', en: 'Dashboard' },
  'nav.agents': { zh: '智能体', en: 'Agents' },
  'nav.knowledge': { zh: '知识库', en: 'Knowledge Base' },
  'nav.logs': { zh: '对话日志', en: 'Conversation Logs' },
  'nav.settings': { zh: '系统设置', en: 'Settings' },
  // Sidebar navigation (SideNav.vue / AppShell.vue) — groups, items, controls
  'nav.overview': { zh: '总览', en: 'Overview' },
  'nav.home': { zh: '返回主页', en: 'Back to home' },
  'nav.expand': { zh: '展开侧栏', en: 'Expand sidebar' },
  'nav.collapse': { zh: '折叠侧栏', en: 'Collapse sidebar' },
  'nav.group.agents': { zh: '智能体中心', en: 'Agent Center' },
  'nav.group.gateway': { zh: '模型调度台', en: 'Model Gateway' },
  'nav.group.observability': { zh: '可观测性', en: 'Observability' },
  'nav.group.system': { zh: '系统配置', en: 'System' },
  'nav.agents.list': { zh: '智能体列表', en: 'Agent List' },
  'nav.agents.config': { zh: '智能体配置', en: 'Agent Config' },
  'nav.agents.marketplace': { zh: '智能体市场', en: 'Marketplace' },
  'nav.gateway.route': { zh: '网关路由', en: 'Gateway Routes' },
  'nav.gateway.key': { zh: '密钥管理', en: 'API Keys' },
  'nav.gateway.supplier': { zh: '模型管理', en: 'Model Management' },
  'nav.obs.metering': { zh: '计量中心', en: 'Metering' },
  'nav.obs.monitor': { zh: '实时监控', en: 'Realtime Monitor' },
  'nav.obs.requests': { zh: '请求日志', en: 'Request Logs' },
  'nav.obs.audit': { zh: '审计日志', en: 'Audit Logs' },
  'nav.system.resources': { zh: '资源池接入', en: 'Resource Pools' },
  'nav.system.gateway': { zh: '模型网关接入', en: 'Gateway Connections' },
  'nav.system.users': { zh: '用户与权限', en: 'Users & Roles' },
  'nav.system.settings': { zh: '平台设置', en: 'Platform Settings' },
  'user.profile': { zh: '个人资料', en: 'Profile' },
  'user.logout': { zh: '退出登录', en: 'Log out' },
  'theme.light': { zh: '浅色', en: 'Light' },
  'theme.dark': { zh: '深色', en: 'Dark' },
  'lang.zh': { zh: '中文', en: 'Chinese' },
  'lang.en': { zh: '英文', en: 'English' },
  'dashboard.title': { zh: '仪表盘', en: 'Dashboard' },
  'dashboard.welcome': { zh: '欢迎回来', en: 'Welcome back' },
  'dashboard.stat.agents': { zh: '智能体数量', en: 'Active Agents' },
  'dashboard.stat.sessions': { zh: '今日对话', en: 'Today’s Sessions' },
  'dashboard.stat.knowledge': { zh: '知识库文档', en: 'Knowledge Documents' },
  'dashboard.stat.uptime': { zh: '服务可用性', en: 'Service Uptime' },
  'dashboard.overview.title': { zh: '总览', en: 'Overview' },
  'dashboard.metric.activeAgents': { zh: '活跃智能体', en: 'Active Agents' },
  'dashboard.metric.activeAgentsCaption': {
    zh: '活跃智能体 / 智能体池总数',
    en: 'Active Agents / Total Agent Pools',
  },
  'dashboard.metric.activeAgentsFoot': {
    zh: '本月新增 10，平均运行 18 天',
    en: 'Month New 10, Avg Run Time 18 days',
  },
  'dashboard.metric.totalCalls': { zh: '总请求量（Calls）', en: 'Total Requests (Calls)' },
  'dashboard.metric.deduplicated': { zh: '（剔除重复数据）', en: '(deduplicated)' },
  'dashboard.metric.today': { zh: '今日', en: 'Today' },
  'dashboard.metric.detailedCount': { zh: '（详细计数）', en: '(detailed count)' },
  'dashboard.metric.trend': { zh: '趋势', en: 'Trend' },
  'dashboard.metric.vsYesterday': { zh: '（较昨日）', en: '(vs. yesterday)' },
  'dashboard.metric.monthlyToken': { zh: '本月 Token 消耗预估', en: 'Monthly Token Estimate' },
  'dashboard.metric.thisMonth': { zh: '本月', en: 'This month' },
  'dashboard.metric.estimatedCost': { zh: '预计月度成本', en: 'Est. Monthly Cost' },
  'dashboard.metric.platformOverview': { zh: '平台运行概览', en: 'Platform Overview' },
  'dashboard.distribution.title': {
    zh: '实例状态分布与健康度趋势',
    en: 'Instance Status & Health Trend',
  },
  'dashboard.status.running': { zh: '运行中', en: 'Running' },
  'dashboard.status.stopped': { zh: '已停止', en: 'Stopped' },
  'dashboard.status.exception': { zh: '异常', en: 'Exception' },
  'dashboard.recent.title': { zh: '最近智能体运行列表', en: 'Recent Agent Runs' },
  'dashboard.recent.name': { zh: '名称', en: 'Name' },
  'dashboard.recent.agentName': { zh: '智能体名称', en: 'Agent Name' },
  'dashboard.recent.createdAt': { zh: '创建时间', en: 'Created At' },
  'dashboard.recent.status': { zh: '状态', en: 'Status' },
  'dashboard.notices.title': { zh: '系统重要通知', en: 'Important System Notices' },
  'coming.soon': { zh: '即将推出', en: 'Coming soon' },
  'coming.soon.desc': {
    zh: '该模块正在建设中，请稍后查看。',
    en: 'This module is under construction. Check back soon.',
  },
  'login.tagline': {
    zh: '一站式管理企业 AI 智能体 — 从资源接入、模型路由到全链路观测与治理,让 AI 在生产中可管、可控、可观测。',
    en: 'Manage enterprise AI agents end-to-end — from resource provisioning and model routing to full-stack observability and governance. Built for production-grade AI.',
  },
  'login.copyright': { zh: '© 智能体管理平台', en: '© Agent Management Platform' },
  'about.title': { zh: '关于智能体管理平台', en: 'About Agent Management Platform' },
  'about.menu': { zh: '关于', en: 'About' },
  'about.version': { zh: '版本', en: 'Version' },
  'about.tagline': {
    zh: '一站式管理企业 AI 智能体 — 从资源接入、模型路由到全链路观测与治理,让 AI 在生产中可管、可控、可观测。',
    en: 'Manage enterprise AI agents end-to-end — from resource provisioning and model routing to full-stack observability and governance. Built for production-grade AI.',
  },
  'about.copyright': {
    zh: '© 智能体管理平台 · 保留所有权利',
    en: '© Agent Management Platform. All rights reserved.',
  },
  'about.close': { zh: '关闭', en: 'Close' },
  'login.heading': { zh: '登录', en: 'Sign in' },
  'login.email': { zh: '邮箱', en: 'Email' },
  'login.password': { zh: '密码', en: 'Password' },
  'login.remember': { zh: '记住我', en: 'Remember me' },
  'login.submit': { zh: '登录', en: 'Sign in' },
  'login.error.email': { zh: '请输入有效的邮箱地址', en: 'Enter a valid email address.' },
  'login.error.password': { zh: '请输入密码', en: 'Password is required.' },
  'login.error.creds': { zh: '邮箱或密码错误', en: 'Invalid email or password.' },
  'agents.list.title': { zh: '智能体列表', en: 'Agent List' },
  'agents.list.description': {
    zh: '统一管理已部署的智能体实例，支持筛选、批量操作与导出。',
    en: 'Centrally manage deployed agent instances with filtering, batch operations, and export.',
  },
  'agents.list.export': { zh: '导出列表', en: 'Export' },
  'agents.export.success': { zh: '已导出 {count} 项', en: 'Exported {count} agents' },
  'agents.export.fail': { zh: '导出失败', en: 'Export failed' },
  'agents.list.batch': { zh: '批量操作', en: 'Batch Actions' },
  'agents.list.refresh': { zh: '刷新', en: 'Refresh' },
  'agents.col.select': { zh: '选择', en: 'Select' },
  'agents.col.name': { zh: '名称', en: 'Name' },
  'agents.col.type': { zh: '智能体类型', en: 'Agent Type' },
  'agents.col.status': { zh: '状态', en: 'Status' },
  'agents.col.key': { zh: '密钥名称', en: 'Key Name' },
  'agents.col.username': { zh: '运行账户', en: 'Run-as User' },
  'agents.col.createdAt': { zh: '创建时间', en: 'Created At' },
  'agents.col.updatedAt': { zh: '更新时间', en: 'Updated At' },
  'agents.col.actions': { zh: '操作', en: 'Actions' },
  'agents.status.running': { zh: '运行中', en: 'Running' },
  'agents.status.stopped': { zh: '已停止', en: 'Stopped' },
  'agents.status.provisioning': { zh: '部署中', en: 'Provisioning' },
  'agents.status.exception': { zh: '异常', en: 'Exception' },
  'agents.status.error': { zh: '异常', en: 'Error' },
  'agents.status.filter.all': { zh: '全部状态', en: 'All statuses' },
  'agents.type.filter.all': { zh: '全部类型', en: 'All types' },
  'agents.type.general-chat': { zh: '通用聊天', en: 'General Chat' },
  'agents.type.image-generation': { zh: '图像生成', en: 'Image Generation' },
  'agents.type.basic-llm': { zh: '基础大模型', en: 'Base LLM' },
  'agents.type.openclaw': { zh: 'OpenClaw', en: 'OpenClaw' },
  'agents.type.hermes': { zh: 'Hermes', en: 'Hermes' },
  'agents.type.claude-code': { zh: 'Claude Code', en: 'Claude Code' },
  'agents.type.xiaoguai': { zh: '小怪', en: 'XiaoGuai' },
  'agents.type.qcoder': { zh: 'QCoder', en: 'QCoder' },
  'agents.type.opencode': { zh: 'OpenCode', en: 'OpenCode' },
  'agents.action.visit': { zh: '访问信息', en: 'Visit Info' },
  'agents.action.configure': { zh: '配置', en: 'Configure' },
  'agents.action.more': { zh: '更多', en: 'More' },
  'agents.action.rotateKey': { zh: '密码更新', en: 'Rotate Key' },
  'agents.action.restart': { zh: '重启', en: 'Restart' },
  'agents.action.stop': { zh: '停止', en: 'Stop' },
  'agents.action.update': { zh: '版本更新', en: 'Version Update' },
  'agents.action.delete': { zh: '删除', en: 'Delete' },
  'agents.action.copyAccess': { zh: '访问信息', en: 'Access info' },
  'agents.action.copyKey': { zh: '复制密钥', en: 'Copy key' },
  'agents.action.copyKeyOk': { zh: '已复制 "{name}"', en: 'Copied "{name}"' },
  'agents.action.copyKeyFail': { zh: '复制失败', en: 'Copy failed' },
  'agents.action.notReady': { zh: '该操作暂未开放（后端接口开发中）', en: 'This action is not available yet (backend API in progress)' },
  'agents.action.noEndpoint': { zh: '该智能体未配置访问端点', en: 'This agent has no endpoint configured' },
  'agents.action.stoppedOk': { zh: '已停止 "{name}"', en: 'Stopped "{name}"' },
  'agents.action.restartedOk': { zh: '已重启 "{name}"', en: 'Restarted "{name}"' },
  'agents.action.deletedOk': { zh: '已删除 "{name}"', en: 'Deleted "{name}"' },
  'agents.action.failed': { zh: '操作失败', en: 'Action failed' },
  'agents.confirm.deleteTitle': { zh: '删除智能体', en: 'Delete agent' },
  'agents.confirm.deleteBody': {
    zh: '确定删除智能体 "{name}"？其 VM 资源将被回收，此操作不可撤销。',
    en: 'Delete agent "{name}"? Its VM resources will be recycled. This cannot be undone.',
  },
  'agents.confirm.batchDeleteBody': {
    zh: '确定删除选中的 {count} 个智能体？其 VM 资源将被回收，此操作不可撤销。',
    en: 'Delete the {count} selected agents? Their VM resources will be recycled. This cannot be undone.',
  },
  'agents.action.sortAsc': { zh: '升序', en: 'Ascending' },
  'agents.action.sortDesc': { zh: '降序', en: 'Descending' },
  'agents.batch.start': { zh: '批量启动', en: 'Start Selected' },
  'agents.batch.stop': { zh: '批量停止', en: 'Stop Selected' },
  'agents.batch.update': { zh: '批量更新', en: 'Update Selected' },
  'agents.batch.delete': { zh: '批量删除', en: 'Delete Selected' },
  'agents.batch.disabled': { zh: '请先选择智能体', en: 'Select agents first' },
  'agents.batch.done': { zh: '批量操作完成：成功 {ok} 个，失败 {fail} 个', en: 'Batch finished: {ok} succeeded, {fail} failed' },
  'agents.upgrade.title': { zh: '升级智能体版本', en: 'Upgrade agent version' },
  'agents.upgrade.single': {
    zh: '将为「{name}」下发升级命令，VM 内 agent-manager 会在下次心跳时拉取安装。',
    en: 'Enqueues an upgrade for "{name}"; the in-VM agent-manager installs it on its next heartbeat.',
  },
  'agents.upgrade.batch': {
    zh: '将为选中的 {n} 个智能体下发同一升级命令（各自下次心跳时执行）。',
    en: 'Enqueues the same upgrade for the {n} selected agents (each runs on its next heartbeat).',
  },
  'agents.upgrade.version': { zh: '目标版本', en: 'Target version' },
  'agents.upgrade.versionPlaceholder': { zh: '如 1.37.0', en: 'e.g. 1.37.0' },
  'agents.upgrade.versionHint': {
    zh: '从内网镜像安装该版本包；版本号仅允许字母数字与 . _ -（不含路径/空格）。',
    en: 'Installs this version from the internal mirror; only letters, digits and . _ - are allowed (no path/space).',
  },
  'agents.upgrade.versionError': {
    zh: '请输入合法版本号（字母数字开头，仅含字母数字与 . _ -，≤128 位）',
    en: 'Enter a valid version (alphanumeric start; only letters, digits and . _ -; ≤128 chars)',
  },
  'agents.upgrade.submit': { zh: '下发升级', en: 'Enqueue upgrade' },
  'agents.upgrade.cancel': { zh: '取消', en: 'Cancel' },
  'agents.upgrade.enqueuedOk': {
    zh: '已为「{name}」下发升级命令',
    en: 'Upgrade enqueued for "{name}"',
  },
  'agents.upgrade.batchEnqueuedOk': {
    zh: '已下发升级命令：{n} 台',
    en: 'Upgrade enqueued for {n} agent(s)',
  },
  'agents.toolbar.selected': { zh: '已选 {count} 项', en: '{count} selected' },
  'agents.col.name.search': { zh: '搜索名称', en: 'Search name' },
  'agents.col.key.search': { zh: '搜索密钥名称', en: 'Search key' },
  'agents.col.username.search': { zh: '搜索运行账户', en: 'Search run-as user' },
  'agents.footer.summary': {
    zh: '显示 {start}-{end} 条,共 {total} 条',
    en: 'Showing {start}-{end} of {total}',
  },
  'agents.pager.first': { zh: '首页', en: 'First page' },
  'agents.pager.prev': { zh: '上一页', en: 'Previous page' },
  'agents.pager.next': { zh: '下一页', en: 'Next page' },
  'agents.pager.last': { zh: '末页', en: 'Last page' },
  'agents.pager.page': { zh: '当前页', en: 'Page' },
  'agents.pager.pageSize': { zh: '每页条数', en: 'Per page' },
  'agents.pager.label': { zh: '分页', en: 'Pagination' },
  'agents.empty': { zh: '暂无智能体', en: 'No agents' },
  'agents.loading': { zh: '加载中…', en: 'Loading…' },
  'agents.error': { zh: '加载失败', en: 'Failed to load' },

  /* ============================================================
   * User & Role Management — see plan §Locale 新增键
   * zh-only per project rule #2 (中文 only).
   * ============================================================ */

  // Page-level
  'users.title': { zh: '用户与权限', en: 'Users & Permissions' },
  'users.description': { zh: '管理平台用户、角色与权限分配，支持密码重置与角色绑定。', en: 'Manage platform users, roles, and permission assignments with password reset and role binding.' },
  'users.tabs.users': { zh: '用户管理', en: 'User Management' },
  'users.tabs.roles': { zh: '角色与权限', en: 'Roles & Permissions' },

  // Toolbar
  'users.toolbar.create': { zh: '新建用户', en: 'Create User' },
  'roles.toolbar.refresh': { zh: '刷新', en: 'Refresh' },

  // Users table columns
  'users.col.username':       { zh: '用户名',            en: 'Username' },
  'users.col.role':           { zh: '角色',              en: 'Role' },
  'users.col.email':          { zh: '邮箱',              en: 'Email' },
  'users.col.enabled':        { zh: '启用状态',          en: 'Status' },
  'users.col.connection':     { zh: '连接状态',          en: 'Connection Status' },
  'users.col.lastLogin':      { zh: '上次登录',          en: 'Last Login' },
  'users.col.createdAt':      { zh: '创建时间',          en: 'Created At' },
  'users.col.updatedAt':      { zh: '更新时间',          en: 'Updated At' },
  'users.col.actions':        { zh: '操作',              en: 'Actions' },

  // Column filter dropdowns
  'users.col.filter.usernamePlaceholder': { zh: '输入关键字筛选用户名', en: 'Filter by username' },
  'users.col.filter.rolePlaceholder': { zh: '输入关键字筛选角色', en: 'Filter by role' },
  'users.col.filter.emailPlaceholder': { zh: '输入关键字筛选邮箱', en: 'Filter by email' },
  'users.col.filter.statusAll': { zh: '全部', en: 'All' },
  'users.col.filter.statusOnline': { zh: '在线', en: 'Online' },
  'users.col.filter.statusOffline': { zh: '离线', en: 'Offline' },
  'users.col.filter.apply': { zh: '应用', en: 'Apply' },
  'users.col.filter.clear': { zh: '清空', en: 'Clear' },
  'users.col.sort': { zh: '排序', en: 'Sort' },
  'users.col.filter': { zh: '过滤', en: 'Filter' },

  // Connection-status badges
  'users.status.online':      { zh: '在线',              en: 'Online' },
  'users.status.offline':     { zh: '离线',              en: 'Offline' },
  // Enabled-state badge in the Users table "启用状态" column.
  'users.status.enabled':     { zh: '已启用',            en: 'Enabled' },
  'users.status.disabled':    { zh: '已禁用',            en: 'Disabled' },

  // Per-row actions
  'users.action.changeRole': { zh: '更换角色',          en: 'Change Role' },
  'users.action.resetPwd':    { zh: '重置密码',          en: 'Reset Password' },
  'users.action.disable':     { zh: '禁用',              en: 'Disable' },
  'users.action.enable':      { zh: '启用',              en: 'Enable' },
  'users.action.delete':      { zh: '删除',              en: 'Delete' },

  // User form (create only)
  'users.form.title.create':  { zh: '新建用户',          en: 'Create User' },
  'users.form.title.changeRole': { zh: '更换角色',       en: 'Change Role' },
  'users.form.username':      { zh: '用户名',            en: 'Username' },
  'users.form.displayName':   { zh: '显示名',            en: 'Display Name' },
  'users.form.email':         { zh: '邮箱',              en: 'Email' },
  'users.form.role':          { zh: '角色',              en: 'Role' },
  'users.form.enabled':       { zh: '启用账户',          en: 'Enable Account' },
  'users.form.passwordMode':  { zh: '密码',              en: 'Password' },
  'users.form.passwordMode.label':   { zh: '密码类型',    en: 'Password Type' },
  'users.form.passwordMode.auto':    { zh: '自动生成',    en: 'Auto-generate' },
  'users.form.passwordMode.custom':  { zh: '自定义',      en: 'Custom' },
  'users.form.passwordMode.autoHint': { zh: '自动生成后通过一次性弹窗显示,注意复制保存!', en: 'The generated password will be shown once in a dialog — copy and save it immediately!' },
  'users.form.customPassword':      { zh: '密码',          en: 'Password' },
  'users.form.confirmPassword':    { zh: '确认密码',      en: 'Confirm Password' },
  'users.form.passwordMismatch':    { zh: '两次输入的密码不一致', en: 'Passwords do not match.' },
  'users.form.passwordHint':        { zh: '密码须包含大小写字母、数字,长度 ≥ 12', en: 'Password must contain uppercase, lowercase, and digits, and be at least 12 characters.' },
  'users.form.requiredMark':       { zh: '*',                en: '*' },
  'users.form.submit':              { zh: '创建',          en: 'Create' },
  'users.form.submitEdit':          { zh: '保存',          en: 'Save' },
  'users.form.cancel':              { zh: '取消',          en: 'Cancel' },
  'users.form.username.required':   { zh: '请输入用户名',  en: 'Username is required.' },
  'users.form.username.taken':      { zh: '该用户名已被使用', en: 'This username is already taken.' },
  'users.form.email.taken':         { zh: '该邮箱已被使用',   en: 'This email is already in use.' },
  'users.form.username.checking':   { zh: '正在检查用户名可用性…', en: 'Checking username availability…' },
  'users.form.email.checking':      { zh: '正在检查邮箱可用性…',   en: 'Checking email availability…' },

  // Page-level empty / loading / error
  'users.empty': { zh: '暂无用户', en: 'No users' },
  'users.loading': { zh: '加载中…', en: 'Loading…' },
  'users.error': { zh: '加载失败', en: 'Failed to load' },

  // Toasts
  'users.toast.createOk':     { zh: '已创建用户 {name}', en: 'User {name} created.' },
  'users.toast.createFail':   { zh: '创建失败',          en: 'Failed to create user.' },
  'users.toast.updateOk':     { zh: '已更新用户 {name}', en: 'User {name} updated.' },
  'users.toast.updateFail':   { zh: '更新失败',          en: 'Failed to update user.' },
  'users.toast.deleteOk':     { zh: '已删除用户 {name}', en: 'User {name} deleted.' },
  'users.toast.deleteFail':   { zh: '删除失败',          en: 'Failed to delete user.' },
  'users.toast.resetPwdOk':   { zh: '密码已重置:新密码已生成并显示', en: 'Password reset. The new password has been generated and displayed.' },
  'users.toast.resetPwdFail': { zh: '密码重置失败',      en: 'Failed to reset password.' },
  'users.toast.disableOk':    { zh: '已禁用 {name}',     en: '{name} has been disabled.' },
  'users.toast.enableOk':     { zh: '已启用 {name}',     en: '{name} has been enabled.' },
  'users.toast.toggleFail':   { zh: '操作失败',          en: 'Operation failed.' },
  'users.toast.duplicateUsername': { zh: '用户名已存在',  en: 'Username already exists.' },
  'users.toast.duplicateEmail':    { zh: '邮箱已被使用',  en: 'Email is already in use.' },
  'users.toast.passwordCopied':    { zh: '已复制到剪贴板', en: 'Copied to clipboard.' },
  'users.toast.copyFailed':       { zh: '复制失败',         en: 'Copy failed.' },

  // Confirm dialogs
  'users.confirm.delete.title':       { zh: '确认删除用户',    en: 'Confirm Delete User' },
  'users.confirm.delete.body':        { zh: '确定要删除用户 {name} 吗?此操作不可撤销。', en: 'Are you sure you want to delete user {name}? This action cannot be undone.' },
  'users.confirm.delete.final.title': { zh: '确认删除', en: 'Confirm Delete' },
  'users.confirm.delete.final.body':  { zh: '将永久删除用户且无法恢复。请输入 {{name}} 以确认。', en: 'This user will be permanently deleted and cannot be recovered. Type {{name}} to confirm.' },
  'users.confirm.delete.inputPlaceholder': { zh: '输入用户名', en: 'Type the username' },
  'users.confirm.reset.title':        { zh: '确认重置密码',    en: 'Confirm Password Reset' },
  'users.confirm.reset.body':    { zh: '将为 {name} 生成新的随机密码,确认继续?', en: 'A new random password will be generated for {name}. Continue?' },
  'users.confirm.disable.title': { zh: '确认禁用用户',    en: 'Confirm Disable User' },
  'users.confirm.disable.body':  { zh: '禁用后,{name} 将无法登录。是否继续?', en: 'After disabling, {name} will not be able to sign in. Continue?' },

  // Password reveal dialog (one-shot)
  'users.passwordReveal.title': { zh: '{name} 的初始密码', en: 'Initial Password for {name}' },
  'users.passwordReveal.warning': {
    zh: '此密码仅显示一次,请立即复制并安全保存。关闭后无法再次查看。',
    en: 'This password is shown only once. Copy and save it now — it cannot be retrieved after closing.',
  },
  'users.passwordReveal.copy': { zh: '复制密码', en: 'Copy Password' },
  'users.passwordReveal.close': { zh: '我已保存,关闭', en: 'I have saved it, close' },

  // Role-users dialog (read-only)
  'users.roleUsers.title':       { zh: '{name} 的用户',  en: 'Users in {name}' },
  'users.roleUsers.col.name':    { zh: '用户名',          en: 'Username' },
  'users.roleUsers.col.email':   { zh: '邮箱',            en: 'Email' },
  'users.roleUsers.col.enabled': { zh: '状态',            en: 'Status' },
  'users.roleUsers.status.enabled':  { zh: '已启用',       en: 'Enabled' },
  'users.roleUsers.status.disabled': { zh: '已禁用',       en: 'Disabled' },
  'users.roleUsers.empty':       { zh: '该角色下暂无用户', en: 'No users in this role' },
  'users.roleUsers.loading':     { zh: '加载中…',          en: 'Loading…' },
  'users.roleUsers.close':       { zh: '关闭',            en: 'Close' },
  'users.toast.loadRoleUsersFail': { zh: '加载角色用户失败', en: 'Failed to load role users.' },

  // Roles tab
  'roles.col.name':             { zh: '角色名称',        en: 'Role Name' },
  'roles.col.description':      { zh: '描述',            en: 'Description' },
  'roles.col.userCount':        { zh: '用户数',          en: 'Users' },
  'roles.empty':                { zh: '暂无角色',        en: 'No roles' },
  'roles.loading':              { zh: '加载中…',          en: 'Loading…' },
  'roles.error':                { zh: '加载失败',        en: 'Failed to load' },

  // Generic
  'common.confirm': { zh: '确认', en: 'Confirm' },
  'common.cancel': { zh: '取消', en: 'Cancel' },

  /* ============================================================
   * Resource Pool Access — see plan
   * `资源池接入页面 (/platform/resources)`
   * zh-only per project rule.
   * ============================================================ */
  'resources.title': { zh: '资源池接入管理', en: 'Resource Pool Management' },
  'resources.description': { zh: '接入并管理可调度的算力资源池，是智能体运行的物理底座。', en: 'Connect and manage schedulable compute resource pools — the infrastructure foundation for running agents.' },
  'resources.toolbar.create': { zh: '接入资源池', en: 'Connect Resource Pool' },
  'resources.toolbar.search': { zh: '搜索资源池名称或 VC 地址', en: 'Search pool name or VC address' },

  'resources.col.name': { zh: '资源池名称', en: 'Resource Pool Name' },
  'resources.col.endpoint': { zh: 'VC 地址', en: 'VC Address' },
  'resources.col.status': { zh: '同步状态', en: 'Sync Status' },
  'resources.col.syncStatus': { zh: '同步状态', en: 'Sync Status' },
  'resources.col.contentLibrary': { zh: '内容库', en: 'Content Library' },
  'resources.col.createdAt': { zh: '创建时间', en: 'Created At' },
  'resources.col.updatedAt': { zh: '更新时间', en: 'Updated At' },
  'resources.col.actions': { zh: '操作', en: 'Actions' },

  'resources.col.name.search': { zh: '搜索资源池名称', en: 'Search pool name' },

  'resources.status.connected': { zh: '已连接', en: 'Connected' },
  'resources.status.disconnected': { zh: '未连接', en: 'Disconnected' },
  'resources.status.filter.all': { zh: '全部状态', en: 'All statuses' },
  'resources.status.synced': { zh: '已同步', en: 'Synced' },
  'resources.status.neverSynced': { zh: '未同步', en: 'Never synced' },
  'resources.status.syncedAgo': { zh: '{ago}已同步', en: 'Synced {ago} ago' },

  'resources.action.manage': { zh: '管理', en: 'Manage' },
  'resources.action.sync': { zh: '立即同步', en: 'Sync now' },
  'resources.action.edit': { zh: '编辑', en: 'Edit' },
  'resources.action.delete': { zh: '删除', en: 'Delete' },
  'resources.action.refresh': { zh: '刷新', en: 'Refresh' },

  'resources.empty': { zh: '暂无资源池', en: 'No resource pools' },
  'resources.loading': { zh: '加载中…', en: 'Loading…' },
  'resources.error': { zh: '加载失败', en: 'Failed to load' },

  'resources.toast.refreshed': { zh: '资源池列表已刷新', en: 'Resource pool list refreshed' },
  'resources.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },

  'resources.footer.syncStatus.title': { zh: '当前同步状态', en: 'Current Sync Status' },
  'resources.footer.syncStatus.summary': {
    zh: '资源池 vCenter_OC1 连接成功,屏幕提示不可连接成功。',
    en: 'Resource pool vCenter_OC1 connected successfully; on-screen prompt shows connection unavailable.',
  },

  // Toasts
  'resources.toast.createOk': { zh: '已创建资源池 {name}', en: 'Resource pool {name} created.' },
  'resources.toast.createFail': { zh: '创建失败', en: 'Failed to create resource pool.' },
  'resources.toast.updateOk': { zh: '已保存资源池 {name}', en: 'Resource pool {name} saved.' },
  'resources.toast.updateFail': { zh: '保存失败', en: 'Failed to save resource pool.' },
  'resources.toast.deleteOk': { zh: '已删除资源池 {name}', en: 'Resource pool {name} deleted.' },
  'resources.toast.deleteFail': { zh: '删除失败', en: 'Failed to delete resource pool.' },
  'resources.toast.syncOk': { zh: '已同步资源池 {name}', en: 'Resource pool {name} synced.' },
  'resources.toast.syncFail': { zh: '同步失败', en: 'Sync failed.' },

  // Form dialog (create / edit)
  'resources.form.title.create': { zh: '接入资源池', en: 'Connect Resource Pool' },
  'resources.form.title.edit': { zh: '编辑资源池', en: 'Edit Resource Pool' },
  'resources.form.name': { zh: '资源池名称', en: 'Resource Pool Name' },
  'resources.form.endpoint': { zh: 'VC 地址', en: 'VC Address' },
  'resources.form.contentLibrary': { zh: '内容库', en: 'Content Library' },
  'resources.form.contentLibrarySelect': { zh: '请先测试连接以加载内容库列表', en: 'Test the connection first to load content libraries.' },
  'resources.form.username': { zh: 'vCenter 账号', en: 'vCenter Account' },
  'resources.form.usernamePlaceholder': { zh: 'administrator@vsphere.local', en: 'administrator@vsphere.local' },
  'resources.form.password': { zh: 'vCenter 密码', en: 'vCenter Password' },
  'resources.form.passwordEditHint': { zh: '留空则不修改已保存的凭据', en: 'Leave blank to keep the saved credentials.' },
  'resources.form.requiredMark': { zh: '*', en: '*' },
  'resources.form.insecure': { zh: '跳过 TLS 验证', en: 'Skip TLS Verification' },
  'resources.form.insecureHint': {
    zh: '仅用于自签名 / 内网 CA 的 vCenter；生产环境请保持验证',
    en: 'Use only for self-signed or internal CA vCenter instances; keep validation enabled in production.',
  },
  'resources.form.testConnection': { zh: '测试连接', en: 'Test Connection' },
  'resources.form.testConnection.success': { zh: '连接成功', en: 'Connection succeeded' },
  'resources.form.testConnection.failure': { zh: '连接失败', en: 'Connection failed' },
  'resources.testConnection.error.empty': { zh: '请先填写名称、VC 地址与内容库名称', en: 'Please fill in the name, VC address, and content library name first.' },
  'resources.form.submit': { zh: '保存', en: 'Save' },

  // Confirm dialog
  'resources.confirm.delete.title': { zh: '确认删除资源池', en: 'Confirm Delete Resource Pool' },
  'resources.confirm.delete.body': { zh: '确定要删除资源池 {name} 吗?此操作不可撤销。', en: 'Are you sure you want to delete resource pool {name}? This action cannot be undone.' },
  'resources.confirm.finalDelete.title': { zh: '再次确认删除', en: 'Confirm Deletion' },
  'resources.confirm.finalDelete.body': {
    zh: '将永久删除该资源池接入且无法恢复。请输入 {{name}} 以确认。',
    en: 'This resource pool integration will be permanently deleted. Type {{name}} to confirm.',
  },
  'resources.confirm.finalDelete.inputPlaceholder': { zh: '输入资源池名称', en: 'Type the resource pool name' },

  // Inventory viewer (asset tree) modal — opened from the "资产" column's
  // "查看" link. Lazy-loaded via RESOURCE_POOL_QUERY (single-pool variant
  // that adds the `datacenters` subtree; the list query omits it).
  'resources.col.inventory': { zh: '资产', en: 'Inventory' },
  'resources.action.view': { zh: '查看', en: 'View' },
  'resources.inventory.title': { zh: '资源池资产', en: 'Resource Pool Inventory' },
  'resources.inventory.viewTitle': { zh: '查看资源池资产', en: 'View Resource Pool Inventory' },
  'resources.inventory.viewDisabledTitle': { zh: '资源池尚未同步,无法查看资产', en: 'Not synced yet; inventory unavailable' },
  'resources.inventory.loadFail': { zh: '加载资源池资产失败', en: 'Failed to load resource pool inventory' },
  'resources.inventory.empty': { zh: '尚未同步,无资产数据', en: 'Not synced yet; no inventory data' },
  'resources.inventory.close': { zh: '关闭', en: 'Close' },
  'resources.inventory.group.clusters': { zh: '集群', en: 'Clusters' },
  'resources.inventory.group.datastores': { zh: '数据存储', en: 'Datastores' },
  'resources.inventory.group.networks': { zh: '网络', en: 'Networks' },
  'resources.inventory.group.folders': { zh: 'VM 文件夹', en: 'VM Folders' },
  'resources.inventory.group.storagePolicies': { zh: '存储策略', en: 'Storage Policies' },
  'resources.inventory.group.hosts': { zh: '主机', en: 'Hosts' },
  'resources.inventory.group.resourcePools': { zh: '资源池', en: 'Resource Pools' },

  // platform settings — user/role management (UserRoleView)

  'gateway.breadcrumb.label': { zh: '面包屑导航', en: 'Breadcrumb' },
  'gateway.breadcrumb.system': { zh: '系统配置', en: 'System Configuration' },
  'gateway.breadcrumb.current': { zh: '模型网关接入', en: 'Model Gateway Integration' },
  'gateway.title': { zh: '模型网关接入管理', en: 'Model Gateway Integration' },
  'gateway.description': {
    zh: '配置并管理 LiteLLM 等大模型网关的接入。',
    en: 'Connect and manage LiteLLM model gateways.',
  },
  'gateway.connectButton': { zh: '接入模型网关', en: 'Connect Gateway' },
  'gateway.action.refresh': { zh: '刷新', en: 'Refresh' },
  'gateway.toast.refreshed': { zh: '网关列表已刷新', en: 'Gateway list refreshed' },
  'gateway.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
  'gateway.search': { zh: '搜索名称或 Endpoint', en: 'Search name or endpoint' },
  'gateway.filter.status': { zh: '状态', en: 'Status' },
  'gateway.filter.all': { zh: '全部状态', en: 'All statuses' },
  'gateway.table.label': { zh: '模型网关列表', en: 'Model gateways' },
  'gateway.col.name': { zh: '网关名称', en: 'Gateway Name' },
  'gateway.col.name.search': { zh: '搜索网关名称', en: 'Search gateway name' },
  'gateway.col.endpoint': { zh: '网关地址', en: 'Gateway URL' },
  'gateway.col.strategy': { zh: '默认路由策略', en: 'Default routing strategy' },
  'gateway.col.status': { zh: '连接状态', en: 'Status' },
  'gateway.col.sync': { zh: '同步状态', en: 'Sync Status' },
  'gateway.col.backendModelCount': { zh: '后端模型数', en: 'Backend models' },
  'gateway.col.createdAt': { zh: '创建时间', en: 'Created at' },
  'gateway.col.updatedAt': { zh: '更新时间', en: 'Updated at' },

  'gateway.col.actions': { zh: '操作', en: 'Actions' },
  // Per-state sync labels — the badge is the single status indicator now
  // that the backend dropped the legacy `status` field.
  'gateway.status.synced': { zh: '已同步', en: 'Synced' },
  'gateway.status.syncing': { zh: '同步中', en: 'Syncing' },
  'gateway.status.partial': { zh: '部分同步', en: 'Partial' },
  'gateway.status.failed': { zh: '同步失败', en: 'Failed' },
  'gateway.status.neverSynced': { zh: '未同步', en: 'Never synced' },
  'gateway.status.syncedAgo': { zh: '{ago}已同步', en: 'Synced {ago} ago' },
  'gateway.strategy.simpleShuffle': { zh: '简单分流', en: 'Simple Shuffle' },
  'gateway.strategy.leastBusy': { zh: '最少繁忙', en: 'Least Busy' },
  'gateway.strategy.latencyBasedRouting': { zh: '基于延迟', en: 'Latency-based Routing' },
  'gateway.strategy.usageBasedRoutingV2': { zh: '基于用量 v2', en: 'Usage-based Routing v2' },
  'gateway.strategy.costBasedRouting': { zh: '基于成本', en: 'Cost-based Routing' },
  'gateway.action.sync': { zh: '立即同步', en: 'Resync' },
  'gateway.action.delete': { zh: '删除', en: 'Delete' },
  'gateway.action.cancel': { zh: '取消', en: 'Cancel' },
  'gateway.action.connect': { zh: '保存', en: 'Save' },
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
  'gateway.form.createTitle': { zh: '接入模型网关', en: 'Connect Model Gateway' },
  'gateway.form.provider': { zh: '网关类型', en: 'Gateway Type' },
  'gateway.form.requiredMark': { zh: '*', en: '*' },
  'gateway.form.name': { zh: '网关名称', en: 'Gateway Name' },
  'gateway.form.namePlaceholder': { zh: '例如 LiteLLM_Router_1', en: 'e.g. LiteLLM_Router_1' },
  'gateway.form.nameError': {
    zh: '名称长度应为 2–64 个字符。',
    en: 'Name must be 2–64 characters.',
  },
  'gateway.form.endpoint': { zh: '网关地址', en: 'Gateway URL' },
  'gateway.form.testConnection': { zh: '测试连接', en: 'Test Connection' },
  'gateway.form.strategyLabel': { zh: '默认路由策略', en: 'Default routing strategy' },
  'gateway.form.testSuccess': {
    zh: '连接成功：{message}',
    en: 'Connection succeeded: {message}',
  },
  'gateway.form.testFailure': {
    zh: '连接失败：{message}',
    en: 'Connection failed: {message}',
  },
  'gateway.form.testMissingInput': {
    zh: '请先填写网关地址和 Master Key。',
    en: 'Please fill in the gateway URL and master key first.',
  },
  'gateway.form.urlError': {
    zh: '请输入有效的 HTTP 或 HTTPS URL。',
    en: 'Enter a valid HTTP or HTTPS URL.',
  },
  'gateway.form.masterKey': { zh: 'Master Key', en: 'Master Key' },
  'gateway.form.masterKeyPlaceholder': { zh: '请输入 Master Key', en: 'Enter master key' },
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
  'gateway.delete.confirm.title': {
    zh: '再次确认删除',
    en: 'Confirm Delete Again',
  },
  'gateway.delete.confirm.body': {
    zh: '将永久删除该模型网关接入且无法恢复。请输入 {{name}} 以确认。',
    en: 'This model gateway integration will be permanently deleted. Type {{name}} to confirm.',
  },
  'gateway.delete.confirm.inputPlaceholder': {
    zh: '输入网关名称',
    en: 'Type the gateway name',
  },
  'gateway.toast.testSuccess': {
    zh: '“{name}”连接测试成功',
    en: 'Connection test succeeded for “{name}”',
  },
  'gateway.toast.testFailed': { zh: '连接测试失败', en: 'Connection test failed' },
  'gateway.toast.syncSuccess': {
    zh: '“{name}”立即同步成功',
    en: 'Resync succeeded for “{name}”',
  },
  'gateway.toast.syncFailed': { zh: '立即同步失败', en: 'Resync failed' },
  'gateway.toast.syncPartial': {
    zh: '“{name}”部分同步成功: {success} 成功, {failed} 失败',
    en: '“{name}” partially synced: {success} succeeded, {failed} failed',
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
  'gateway.sync.summary': {
    zh: '{success} 个网关同步成功，{failed} 个网关需要处理。',
    en: '{success} gateway(s) synchronized; {failed} need attention.',
  },
  'gateway.sync.noLog': { zh: '暂无同步日志。', en: 'No synchronization log yet.' },
  'gateway.sync.never': { zh: '尚未同步', en: 'Never' },
  'gateway.sync.state.synced': { zh: '同步正常', en: 'Synchronized' },
  'gateway.sync.state.syncing': { zh: '同步中', en: 'Synchronizing' },
  'gateway.sync.state.partial': { zh: '部分异常', en: 'Partially synchronized' },
  'gateway.sync.state.failed': { zh: '同步失败', en: 'Failed' },
  'gateway.sync.state.never': { zh: '尚未同步', en: 'Never synchronized' },

  /* ============================================================
   * Agent Marketplace v3 — see plan
   * `智能体市场 (/agents/marketplace)` 包含 Family/Version/VirtualKey/Credentials
   * 双语交付 (zh + en)
   * ============================================================ */
  'marketplace.title': { zh: '智能体市场', en: 'Agent Marketplace' },
  'marketplace.description': {
    zh: '从已验证的 OVA 模板快速创建智能体，支持 OpenClaw、Hermes、OpenCode 等多种架构',
    en: 'Create agents from validated OVA templates — supports OpenClaw, Hermes, OpenCode, and more',
  },
  'marketplace.toolbar.search': { zh: '搜索模板', en: 'Search template' },
  'marketplace.toolbar.create': { zh: '新增智能体模版', en: 'Add Agent Template' },
  'marketplace.toolbar.typeFilter': { zh: '按类型筛选', en: 'Filter by type' },
  'marketplace.toolbar.typeFilterAll': { zh: '全部类型', en: 'All types' },

  'marketplace.card.tools': { zh: '预装工具', en: 'Pre-installed Tools' },
  'marketplace.card.skills': { zh: '预装技能', en: 'Pre-installed Skills' },
  'marketplace.card.scenarios': { zh: '适用场景', en: 'Use Cases' },
  'marketplace.card.action.view': { zh: '查看详情', en: 'View Details' },
  'marketplace.card.action.create': { zh: '部署智能体', en: 'Deploy Agent' },
  'marketplace.card.versionSelect': { zh: '选择版本', en: 'Select version' },
  'marketplace.card.version': {
    zh: '当前 v{version} · 共 {count} 个版本',
    en: 'Current v{version} · {count} versions',
  },

  'marketplace.pager.first': { zh: '首页', en: 'First page' },
  'marketplace.pager.prev': { zh: '上一页', en: 'Previous page' },
  'marketplace.pager.next': { zh: '下一页', en: 'Next page' },
  'marketplace.pager.last': { zh: '末页', en: 'Last page' },
  'marketplace.pager.label': { zh: '分页', en: 'Pagination' },
  'marketplace.pager.summary': {
    zh: '显示 {start}-{end} 条，共 {total} 条',
    en: 'Showing {start}-{end} of {total}',
  },

  'marketplace.empty': { zh: '暂无可用模板', en: 'No templates available' },
  'marketplace.loading': { zh: '加载中…', en: 'Loading…' },
  'marketplace.error': { zh: '加载失败', en: 'Failed to load' },

  'marketplace.type.general-chat': { zh: '通用聊天', en: 'General Chat' },
  'marketplace.type.image-generation': { zh: '图像生成', en: 'Image Generation' },
  'marketplace.type.basic-llm': { zh: '基础大模型', en: 'Base LLM' },
  'marketplace.type.openclaw': { zh: 'OpenClaw', en: 'OpenClaw' },
  'marketplace.type.hermes': { zh: 'Hermes', en: 'Hermes' },
  'marketplace.type.claude-code': { zh: 'Claude Code', en: 'Claude Code' },
  'marketplace.type.xiaoguai': { zh: '小怪', en: 'XiaoGuai' },
  'marketplace.type.qcoder': { zh: 'QCoder', en: 'QCoder' },
  'marketplace.type.opencode': { zh: 'OpenCode', en: 'OpenCode' },

  'marketplace.color.blue': { zh: '蓝色', en: 'Blue' },
  'marketplace.color.purple': { zh: '紫色', en: 'Purple' },
  'marketplace.color.orange': { zh: '橙色', en: 'Orange' },
  'marketplace.color.green': { zh: '绿色', en: 'Green' },
  'marketplace.color.red': { zh: '红色', en: 'Red' },
  'marketplace.color.cyan': { zh: '青色', en: 'Cyan' },

  'marketplace.toast.createFamilyOk': {
    zh: '已新增智能体模版 {name}',
    en: 'Template {name} added',
  },
  'marketplace.toast.createFamilyFail': { zh: '新增失败', en: 'Failed to add template' },
  'marketplace.toast.viewPlaceholder': {
    zh: '查看详情功能即将上线',
    en: 'View details coming soon',
  },
  'marketplace.toast.deployOk': {
    zh: '已部署智能体 {name}，运行账户：{username}',
    en: 'Agent {name} deployed as {username}',
  },
  'marketplace.toast.deployFail': { zh: '部署失败', en: 'Failed to deploy' },
  'marketplace.toast.deployPoolEmpty': {
    zh: '暂无可用资源池，请先在「系统配置 → 资源池接入」中接入资源池',
    en: 'No resource pools available. Please connect one first.',
  },

  // 新增 OVA 模板 Dialog
  'marketplace.form.title.create': { zh: '新增智能体模版', en: 'Add Agent Template' },
  'marketplace.form.name': { zh: '智能体名称', en: 'Agent name' },
  'marketplace.form.namePlaceholder': { zh: '如 OpenClaw', en: 'e.g. OpenClaw' },
  'marketplace.form.type': { zh: '智能体类型', en: 'Agent type' },
  'marketplace.form.initialVersion': { zh: '初始版本号', en: 'Initial version' },
  'marketplace.form.versionPlaceholder': { zh: 'v1.0.0', en: 'v1.0.0' },
  'marketplace.form.ovaIdentifier': { zh: 'OVA 标识符', en: 'OVA Identifier' },
  'marketplace.form.ovaIdentifierPlaceholder': {
    zh: '如 openclaw-vm-v1.4.2',
    en: 'e.g. openclaw-vm-v1.4.2',
  },
  'marketplace.form.ovaIdentifierHint': {
    zh: '后端将使用此标识符在 vSphere Content Library 中查找 OVF 模板',
    en: 'Backend uses this identifier to locate the OVF template in vSphere Content Library',
  },
  'marketplace.form.description': { zh: '描述', en: 'Description' },
  'marketplace.form.tools': { zh: '支持的工具（每行一个）', en: 'Supported tools (one per line)' },
  'marketplace.form.scenarios': { zh: '适用场景（每行一个）', en: 'Use cases (one per line)' },
  'marketplace.form.skills': {
    zh: '预装技能（每行一个）',
    en: 'Pre-installed Skills (one per line)',
  },
  'marketplace.form.submit': { zh: '提交', en: 'Submit' },
  'marketplace.form.cancel': { zh: '取消', en: 'Cancel' },
  'marketplace.form.error.name': { zh: '名称不能为空', en: 'Name is required' },
  'marketplace.form.error.version': { zh: '版本号不能为空', en: 'Version is required' },
  'marketplace.form.resourcePool': { zh: '资源池', en: 'Resource pool' },
  'marketplace.form.contentLibrary': { zh: '内容库', en: 'Content library' },
  'marketplace.form.contentLibrarySelectPool': {
    zh: '请先选择资源池',
    en: 'Select a resource pool first',
  },
  'marketplace.form.contentLibraryLoading': { zh: '加载中…', en: 'Loading…' },
  'marketplace.form.contentLibraryEmpty': {
    zh: '该 vCenter 暂无内容库',
    en: 'No content libraries on this vCenter',
  },
  'marketplace.form.contentLibraryError': {
    zh: 'vCenter 连接失败，请先更新资源池凭据',
    en: 'vCenter connection failed, please update resource pool credentials',
  },
  'marketplace.form.contentLibraryPlaceholder': {
    zh: '请选择内容库',
    en: 'Select content library',
  },
  'marketplace.form.ovaTemplate': { zh: 'OVA 模板', en: 'OVA template' },
  'marketplace.form.ovaTemplateSelectPool': {
    zh: '请先选择资源池',
    en: 'Select a resource pool first',
  },
  'marketplace.form.ovaTemplateSelectLibrary': {
    zh: '请先选择内容库',
    en: 'Select a content library first',
  },
  'marketplace.form.ovaTemplateLoading': { zh: '加载中…', en: 'Loading…' },
  'marketplace.form.ovaTemplateEmpty': {
    zh: '内容库暂无 OVA 模板',
    en: 'No OVA templates in content library',
  },
  'marketplace.form.ovaTemplatePlaceholder': { zh: '请选择 OVA 模板', en: 'Select OVA template' },
  'marketplace.form.error.contentLibrary': {
    zh: '请选择内容库',
    en: 'Content library is required',
  },
  'marketplace.form.error.pool': { zh: '请选择资源池', en: 'Resource pool is required' },
  'marketplace.form.error.ovaTemplate': { zh: '请选择 OVA 模板', en: 'OVA template is required' },
  'marketplace.form.error.ovaIdentifier': {
    zh: 'OVA 标识符不能为空',
    en: 'OVA identifier is required',
  },
  'marketplace.form.error.ovaIdentifierFormat': {
    zh: '标识符只能包含字母、数字、连字符、下划线和点',
    en: 'Identifier may only contain letters, digits, hyphens, underscores and dots',
  },
  'marketplace.form.switchToCustom': { zh: '自定义', en: 'Advanced' },
  'marketplace.form.switchToDefault': { zh: '返回默认', en: 'Default' },

  // 部署 Dialog (create-from-OVA)
  'marketplace.deploy.title': { zh: '从模板部署智能体', en: 'Deploy Agent from Template' },
  'marketplace.deploy.version': { zh: '选择版本', en: 'Select version' },
  'marketplace.deploy.versionLatest': { zh: '（最新）', en: '(latest)' },
  'marketplace.deploy.pool': { zh: '目标资源池', en: 'Target resource pool' },
  'marketplace.deploy.name': { zh: '智能体名称', en: 'Agent name' },
  'marketplace.deploy.namePlaceholder': {
    zh: '如 OpenClaw_Robot_Prod',
    en: 'e.g. OpenClaw_Robot_Prod',
  },
  'marketplace.deploy.hostname': { zh: '主机名（可选）', en: 'Hostname (optional)' },
  'marketplace.deploy.hostnamePlaceholder': { zh: '如 agent-vm-01', en: 'e.g. agent-vm-01' },
  'marketplace.deploy.notes': { zh: '部署说明（可选）', en: 'Deploy notes (optional)' },
  'marketplace.deploy.notesPlaceholder': { zh: '如 用于生产环境 Web 服务', en: 'e.g. production web service' },
  'marketplace.deploy.targetPool': { zh: 'vSphere 放置资源池', en: 'vSphere placement pool' },
  'marketplace.deploy.targetPoolPlaceholder': {
    zh: '请选择放置资源池',
    en: 'Select a placement pool',
  },
  'marketplace.deploy.targetPoolEmpty': {
    zh: '该 vCenter 无可选资源池（将继承源模板所在池）',
    en: 'No pools available (clone inherits the source template pool)',
  },
  'marketplace.deploy.targetPoolLoading': { zh: '正在加载资源池…', en: 'Loading pools…' },
  'marketplace.deploy.error.targetPool': {
    zh: '请选择 vSphere 放置资源池',
    en: 'Please select a vSphere placement pool',
  },
  'marketplace.deploy.targetNetwork': {
    zh: '目标网络/端口组（可选）',
    en: 'Target network / portgroup (optional)',
  },
  'marketplace.deploy.targetNetworkPlaceholder': { zh: '请选择端口组', en: 'Select a portgroup' },
  'marketplace.deploy.targetNetworkLoading': { zh: '正在加载网络…', en: 'Loading networks…' },
  'marketplace.deploy.targetNetworkEmpty': {
    zh: '该 vCenter 无可用网络（将继承源模板网卡）',
    en: 'No networks available (clone inherits the source template NIC)',
  },
  'marketplace.deploy.maxBudget': { zh: '预算上限（可选）', en: 'Budget cap (optional)' },
  'marketplace.deploy.maxBudgetPlaceholder': { zh: '如 100', en: 'e.g. 100' },
  'marketplace.deploy.submit': { zh: '开始部署', en: 'Deploy' },
  'marketplace.deploy.cancel': { zh: '取消', en: 'Cancel' },
  'marketplace.deploy.error.version': {
    zh: '请选择模板版本',
    en: 'Please select a template version',
  },
  'marketplace.deploy.error.pool': { zh: '请选择目标资源池', en: 'Please select a resource pool' },
  'marketplace.deploy.error.name': { zh: '请输入智能体名称', en: 'Agent name is required' },
  'marketplace.deploy.error.maxBudget': {
    zh: '预算上限须为非负数字',
    en: 'Budget cap must be a non-negative number',
  },

  'marketplace.detail.versions': { zh: '版本历史', en: 'Version History' },
  'marketplace.detail.close': { zh: '关闭', en: 'Close' },

  // Model routing
  'gatewayModel.title': { zh: '网关路由配置', en: 'Gateway Route Configuration' },
  'gatewayModel.toast.actionFailed': { zh: '操作失败', en: 'Action failed' },
  'gatewayModel.description': { zh: '管理网关上的路由清单（关联网关、路由策略、底层供应商模型与降级链），按策略将请求分派到不同后端模型。', en: 'Manage the gateway route catalogue (linked gateway, routing strategy, underlying provider models, and fallback chains); dispatch requests to backend models by strategy.' },
  'gatewayModel.table.label': { zh: '网关路由列表', en: 'Gateway routes' },
  'gatewayModel.sort': { zh: '排序：{column}', en: 'Sort {column}' },
  'gatewayModel.filter': { zh: '过滤：{column}', en: 'Filter {column}' },
  'gatewayModel.filter.all': { zh: '全部', en: 'All' },
  'gatewayModel.filter.clear': { zh: '清除过滤', en: 'Clear filter' },
  'gatewayModel.filter.namePlaceholder': { zh: '输入路由名称', en: 'Enter route name' },
  'gatewayModel.filter.modelsPlaceholder': { zh: '输入模型名称', en: 'Enter model name' },
  'gatewayModel.action.create': { zh: '新建路由', en: 'New Route' },
  'gatewayModel.action.batch': { zh: '批量操作', en: 'Batch Actions' },
  'gatewayModel.action.refresh': { zh: '刷新', en: 'Refresh' },
  'gatewayModel.action.edit': { zh: '编辑', en: 'Edit' },
  'gatewayModel.action.manage': { zh: '管理', en: 'Manage' },
  'gatewayModel.action.delete': { zh: '删除', en: 'Delete' },
  'gatewayModel.batch.delete': { zh: '批量删除', en: 'Delete Selected' },
  'gatewayModel.batch.disabled': { zh: '请先选择路由', en: 'Select routes first' },
  'gatewayModel.col.selectAll': { zh: '选择当前页全部路由', en: 'Select all routes on this page' },
  'gatewayModel.col.selectRoute': { zh: '选择路由 {name}', en: 'Select route {name}' },
  'gatewayModel.col.name': { zh: '路由名称', en: 'Route Name' },
  'gatewayModel.col.gateway': { zh: '模型网关', en: 'Model Gateway' },
  'gatewayModel.col.strategy': { zh: '路由策略', en: 'Routing Strategy' },
  'gatewayModel.col.models': { zh: '网关模型', en: 'Gateway Models' },
  'gatewayModel.col.actions': { zh: '操作', en: 'Actions' },
  'gatewayModel.col.createdAt': { zh: '创建时间', en: 'Created At' },
  'gatewayModel.col.updatedAt': { zh: '更新时间', en: 'Updated At' },
  // LoadBalancingStrategy (LiteLLM wire-level — kebab-case on the wire, UPPER_SNAKE in
  // the GraphQL enum).
  'gatewayModel.strategy.SIMPLE_SHUFFLE': { zh: '简单洗牌', en: 'Simple Shuffle' },
  'gatewayModel.strategy.LEAST_BUSY': { zh: '最闲优先', en: 'Least Busy' },
  'gatewayModel.strategy.LATENCY_BASED_ROUTING': {
    zh: '延迟优先',
    en: 'Latency-based Routing',
  },
  'gatewayModel.strategy.USAGE_BASED_ROUTING_V2': {
    zh: '使用率优先',
    en: 'Usage-based Routing v2',
  },
  'gatewayModel.strategy.COST_BASED_ROUTING': { zh: '成本优先', en: 'Cost-based Routing' },
  'gatewayModel.empty': { zh: '暂无网关路由', en: 'No gateway routes' },
  'gatewayModel.selected': { zh: '已选 {count} 项', en: '{count} selected' },
  'gatewayModel.pagination.pageSize': { zh: '每页条数', en: 'Per page' },
  'gatewayModel.pagination.summary': {
    zh: '显示 {start}-{end} 条，共 {total} 条',
    en: 'Showing {start}-{end} of {total}',
  },
  'gatewayModel.pagination.label': { zh: '网关路由分页', en: 'Gateway route pagination' },
  'gatewayModel.form.createTitle': { zh: '新建网关路由', en: 'New Gateway Route' },
  'gatewayModel.form.editTitle': { zh: '编辑网关路由', en: 'Edit Gateway Route' },
  'gatewayModel.form.name': { zh: '路由名称', en: 'Route Name' },
  'gatewayModel.form.namePlaceholder': {
    zh: '例如 global_litellm_router',
    en: 'e.g. global_litellm_router',
  },
  'gatewayModel.form.nameError': {
    zh: '名称长度应为 2–64 个字符。',
    en: 'Name must be 2–64 characters.',
  },
  'gatewayModel.form.gateway': { zh: '模型网关', en: 'Model Gateway' },
  'gatewayModel.form.gatewayPlaceholder': {
    zh: '请选择模型网关',
    en: 'Select a model gateway',
  },
  'gatewayModel.form.gatewayError': { zh: '请选择模型网关。', en: 'Select a model gateway.' },
  'gatewayModel.form.strategy': { zh: '路由策略', en: 'Routing Strategy' },
  'gatewayModel.form.models': { zh: '选择路由的模型', en: 'Models' },
  'gatewayModel.form.modelsPlaceholder': {
    zh: '每行填写一个模型，或使用逗号分隔',
    en: 'Enter one model per line or separate with commas',
  },
  'gatewayModel.form.modelsError': { zh: '请至少填写一个模型。', en: 'Enter at least one model.' },
  'gatewayModel.form.requiredMark': { zh: '*', en: '*' },
  'gatewayModel.form.submit': { zh: '修改', en: 'Update' },
  'gatewayModel.form.submitCreate': { zh: '创建', en: 'Create' },
  'gatewayModel.confirm.deleteTitle': { zh: '确认删除网关路由', en: 'Delete Gateway Route' },
  'gatewayModel.confirm.deleteBody': {
    zh: '确定要删除路由“{name}”吗？此操作无法撤销。',
    en: 'Delete route “{name}”? This action cannot be undone.',
  },
  'gatewayModel.confirm.batchDeleteTitle': { zh: '确认批量删除', en: 'Delete Selected Routes' },
  'gatewayModel.confirm.batchDeleteBody': {
    zh: '确定要删除选中的 {count} 个路由吗？此操作无法撤销。',
    en: 'Delete the selected {count} routes? This action cannot be undone.',
  },
  // Second-step confirmation (modeled after `gateway.delete.confirm.*`).
  // After the operator acknowledges the first delete dialog the second
  // one renders a type-to-confirm input so they have to retype the
  // route's name verbatim — guards against muscle-memory clicks on a
  // row other than the one they meant to delete.
  'gatewayModel.confirm.finalDeleteTitle': {
    zh: '再次确认删除',
    en: 'Confirm Delete Again',
  },
  'gatewayModel.confirm.finalDeleteBody': {
    zh: '将永久删除该网关路由且无法恢复。请输入 {{name}} 以确认。',
    en: 'This gateway route will be permanently deleted. Type {{name}} to confirm.',
  },
  'gatewayModel.confirm.finalDeleteInputPlaceholder': {
    zh: '输入路由名称',
    en: 'Type the route name',
  },
  'gatewayModel.toast.created': { zh: '网关路由已创建', en: 'Gateway route created' },
  'gatewayModel.toast.updated': { zh: '网关路由已更新', en: 'Gateway route updated' },
  'gatewayModel.toast.deleted': {
    zh: '已删除 {count} 个网关路由',
    en: 'Deleted {count} gateway routes',
  },
  'gatewayModel.toast.manageGateway': {
    zh: '正在打开“{name}”的网关管理配置',
    en: 'Opening gateway configuration for “{name}”',
  },
  'gatewayModel.toast.refreshed': { zh: '网关路由列表已刷新', en: 'Gateway routes refreshed' },
  // M2 specific additions (LiteLLM design doc §3.2):
  // - Sync Now button + toast
  // - Fallback chains (general / context_window / content_policy)
  // - Shuttle selector labels
  // - UI strategy vs Litellm strategy distinction
  'gatewayModel.action.sync': { zh: '同步路由', en: 'Sync Router Settings' },
  'gatewayModel.toast.syncSuccess': { zh: '路由设置已同步', en: 'Router settings synced' },
  'gatewayModel.toast.syncFailed': { zh: '路由设置同步失败', en: 'Failed to sync router settings' },
  'gatewayModel.form.candidatesLabel': { zh: '可选模型列表', en: 'Available provider models' },
  'gatewayModel.form.selectedLabel': { zh: '已选定的模型', en: 'Bound models' },
  'gatewayModel.form.modelsEmpty': {
    zh: '暂无可用模型,请先选择模型网关',
    en: 'No available models yet — select a model gateway first',
  },
  'gatewayModel.form.modelsLoading': {
    zh: '正在加载可用模型…',
    en: 'Loading available models…',
  },
  'gatewayModel.form.modelsEmptyAfterPick': {
    zh: '该网关暂无可用模型',
    en: 'This gateway has no available models',
  },
  'gatewayModel.form.nameHint': {
    zh: '大写字母、数字与中划线,2-64 字符',
    en: 'Uppercase letters, digits, and hyphens, 2-64 chars',
  },
  'gatewayModel.form.advanced': { zh: '高级参数', en: 'Advanced' },
  'gatewayModel.fallbacks.general': { zh: '常规故障转移', en: 'General Fallbacks' },
  'gatewayModel.fallbacks.generalHint': {
    zh: '任何网络错误或限流时按顺序顺延',
    en: 'On any network/limit error, fall through in order',
  },
  'gatewayModel.fallbacks.context': { zh: '上下文超限降级', en: 'Context Window Fallbacks' },
  'gatewayModel.fallbacks.contextHint': {
    zh: '超出模型最大 token 时降级到大上下文模型',
    en: 'When prompt exceeds the model token limit',
  },
  'gatewayModel.fallbacks.content': { zh: '内容策略降级', en: 'Content Policy Fallbacks' },
  'gatewayModel.fallbacks.contentHint': {
    zh: '触发内容审查时降级到更宽松的模型',
    en: 'When content policy blocks the response',
  },
  'gatewayModel.fallbacks.empty': {
    zh: '暂无可作为降级目标的路由',
    en: 'No other routes available as fallbacks',
  },

  // Virtual keys
  'virtualKey.title': { zh: '密钥管理', en: 'API Keys Management' },
  'virtualKey.description': {
    zh: '颁发和管理调用方使用的 API 密钥，支持额度与作用域控制。',
    en: 'Issue and manage Virtual API Keys for callers, with quota and scope controls.',
  },
  'virtualKey.table.label': { zh: '令牌列表', en: 'Virtual keys' },
  'virtualKey.sort': { zh: '排序：{column}', en: 'Sort {column}' },
  'virtualKey.filter': { zh: '过滤：{column}', en: 'Filter {column}' },
  'virtualKey.filter.clear': { zh: '清除过滤', en: 'Clear filter' },
  'virtualKey.filter.all': { zh: '全部', en: 'All' },
  'virtualKey.filter.namePlaceholder': { zh: '输入令牌名称', en: 'Enter key name' },
  'virtualKey.filter.agentPlaceholder': { zh: '输入智能体名称', en: 'Enter agent name' },
  'virtualKey.filter.modelsPlaceholder': { zh: '输入模型名称', en: 'Enter model name' },
  'virtualKey.filter.datePlaceholder': { zh: '选择日期', en: 'Choose a date' },
  'virtualKey.filter.status.ALL': { zh: '全部状态', en: 'All statuses' },
  'virtualKey.filter.status.ENABLED': { zh: '启用', en: 'Enabled' },
  'virtualKey.filter.status.DISABLED': { zh: '禁用', en: 'Disabled' },
  'virtualKey.action.create': { zh: '颁发密钥', en: 'New Key' },
  'virtualKey.action.batch': { zh: '批量操作', en: 'Batch Actions' },
  'virtualKey.action.refresh': { zh: '刷新', en: 'Refresh' },
  'virtualKey.action.copyKey': { zh: '复制令牌', en: 'Copy Key' },
  'virtualKey.action.copyAgent': { zh: '复制智能体 ID', en: 'Copy Agent ID' },
  'virtualKey.action.copyMasked': { zh: '复制令牌掩码', en: 'Copy masked key' },
  'virtualKey.action.edit': { zh: '编辑', en: 'Edit' },
  'virtualKey.action.enable': { zh: '启用', en: 'Enable' },
  'virtualKey.action.disable': { zh: '禁用', en: 'Disable' },
  'virtualKey.action.delete': { zh: '删除', en: 'Delete' },
  // View row action — opens a read-only modal with the key's full
  // configuration (model allowlist, budget, rate limits, allowed routes,
  // tags, etc). Non-destructive; available to any operator so they can
  // audit a key without needing edit / clone permissions.
  'virtualKey.action.view': { zh: '查看', en: 'View' },
  // Clone row action — re-opens the issue form pre-populated from this
  // row's governance fields. Non-destructive; the source key stays put.
  // Source-side label is intentionally brief; the modal title carries
  // the "克隆令牌" wording.
  'virtualKey.action.clone': { zh: '克隆', en: 'Clone' },
  // Admin-only ops shortcut on the toolbar — opens the bulk-purge
  // confirm dialog. "清理 revoked key" reads naturally on a CN
  // console; "Purge revoked keys" on the EN side matches the
  // backend mutation's verb (purgeRevokedVirtualKeys).
  'virtualKey.action.purge': {
    zh: '清理密钥',
    en: 'Purge keys',
  },
  'virtualKey.batch.enable': { zh: '批量启用', en: 'Enable Selected' },
  'virtualKey.batch.disable': { zh: '批量禁用', en: 'Disable Selected' },
  'virtualKey.batch.delete': { zh: '批量删除', en: 'Delete Selected' },
  'virtualKey.batch.disabled': { zh: '请先选择令牌', en: 'Select virtual keys first' },
  'virtualKey.col.selectAll': { zh: '选择当前页全部令牌', en: 'Select all keys on this page' },
  'virtualKey.col.selectKey': { zh: '选择令牌 {name}', en: 'Select key {name}' },
  'virtualKey.col.name': { zh: '名称', en: 'Name' },
  'virtualKey.col.agent': { zh: '绑定的智能体', en: 'Bound Agent' },
  'virtualKey.col.modelGateway': { zh: '所属模型网关', en: 'Gateway' },
  'virtualKey.col.models': { zh: '可调用模型', en: 'Allowed Models' },
  // +N overflow affordance shown after the first 3 model badges in a row.
  // `modelsMore` is the visible label (already includes the `+` glyph), used
  // as `title` on the button so hover reveals "再显示 N 个" hint without
  // needing the popover open. `modelsMoreAria` is the longer screen-reader
  // label because the visible `+N` alone reads ambiguously to AT.
  'virtualKey.col.modelsMore': { zh: '再显示 {count} 个', en: '+{count} more' },
  'virtualKey.col.modelsMoreAria': { zh: '展开剩余 {count} 个模型', en: 'Show remaining {count} models' },
  'virtualKey.col.maskedKey': { zh: '密钥', en: 'Key' },
  'virtualKey.col.status': { zh: '状态', en: 'Status' },
  'virtualKey.col.expiresAt': { zh: '过期时间', en: 'Expires At' },
  'virtualKey.col.progress': { zh: '消费进度', en: 'Consumption' },
  'virtualKey.col.timeInfo': { zh: '时间信息', en: 'Time Info' },
  // Sub-labels for the time-info cells + drawer rows. Kept under the same
  // `virtualKey.col.*` namespace since they render next to their values
  // just like a normal column label, but they no longer address a real
  // <cds-grid-column> (the three former columns were collapsed into
  // TIME_INFO).
  'virtualKey.col.lastActiveAt': { zh: '最近活动', en: 'Last Active' },
  'virtualKey.col.createdAt': { zh: '创建', en: 'Created' },
  'virtualKey.col.updatedAt': { zh: '更新', en: 'Updated' },
  // Inline affordance on the TIME_INFO cell that opens the per-key
  // detail drawer with all three timestamps. Compact two-character
  // label so it fits the 12% column without forcing the row's height
  // to grow.
  'virtualKey.col.timeInfoMore': { zh: '更多', en: 'More' },
  'virtualKey.col.actions': { zh: '操作', en: 'Actions' },
  'virtualKey.status.enabled': { zh: '启用', en: 'Enabled' },
  'virtualKey.status.disabled': { zh: '禁用', en: 'Disabled' },
  'virtualKey.empty': { zh: '暂无密钥', en: 'No API keys' },
  // Time-info detail (drawer opened by clicking the 时间信息 column cell).
  // Labels reuse the existing `virtualKey.col.*` strings where the
  // wording matches (createdAt / lastActiveAt); only new keys are added
  // here — drawer close button + the never-yet-active placeholder.
  'virtualKey.detail.neverActive': { zh: '暂无活动', en: 'Never active' },
  'virtualKey.detail.close': { zh: '关闭', en: 'Close' },
  // View modal (read-only) — opened by the row's "查看" action. The
  // modal title mirrors the create / clone form's title pattern
  // (action · name), so the operator can tell at a glance which key
  // they're inspecting when multiple are open across navigation.
  'virtualKey.view.title': { zh: '查看密钥', en: 'View API Key' },
  'virtualKey.view.close': { zh: '关闭', en: 'Close' },
  // Subtitle shown beneath the modal title in the header block.
  // Generic read-only cue; the section cards below carry per-section
  // headings so the subtitle stays section-agnostic.
  'virtualKey.view.subtitle': {
    zh: '只读模式 — 以下为该密钥的当前配置参数',
    en: 'Read-only view of this key’s current configuration',
  },
  // Section labels used inside the view modal. Grouped under
  // `virtualKey.view.section.*` so the modal can pick from a flat
  // namespace and reuse the strings if a section is hidden.
  'virtualKey.view.section.basic': { zh: '基本信息', en: 'Basic' },
  'virtualKey.view.section.governance': { zh: '治理参数', en: 'Governance' },
  'virtualKey.view.section.rateLimit': { zh: '速率限制', en: 'Rate Limits' },
  'virtualKey.view.section.routing': { zh: '路由与标签', en: 'Routing & Tags' },
  'virtualKey.view.field.name': { zh: '名称', en: 'Name' },
  'virtualKey.view.field.status': { zh: '状态', en: 'Status' },
  'virtualKey.view.field.keyType': { zh: '密钥类型', en: 'Key Type' },
  'virtualKey.view.field.maskedKey': { zh: '令牌掩码', en: 'Masked Key' },
  'virtualKey.view.field.agent': { zh: '绑定的智能体', en: 'Bound Agent' },
  'virtualKey.view.field.modelGateway': { zh: '所属模型网关', en: 'Gateway' },
  // AllowedModels deliberately omitted — the row's MODELS cell + the
  // +N overflow popover cover this. Putting the list inside the modal
  // too would just duplicate the table view.
  'virtualKey.view.field.allowedRoutes': { zh: '可调用接口', en: 'Allowed Endpoints' },
  // Default sentinel for fields where "no value" semantically means
  // "unrestricted" rather than "missing" — used for allowedRoutes /
  // allowedModels / tags where a missing array means the key has no
  // restriction list.
  'virtualKey.view.unrestricted': { zh: '全部', en: 'All' },
  'virtualKey.view.field.tags': { zh: '标签', en: 'Tags' },
  'virtualKey.view.field.expiresAt': { zh: '过期时间', en: 'Expires At' },
  // Budget cap renders as a single "spent / cap (period)" string —
  // 见 VirtualKeyViewModal.vue `budgetLine`. Spent and budgetDuration
  // don't get individual keys; they're formatted together to keep
  // the governance section visually tight.
  'virtualKey.view.field.maxBudget': { zh: '消费上限', en: 'Spend Cap' },
  'virtualKey.view.field.maxParallelRequests': { zh: '最大并发', en: 'Max Parallel' },
  'virtualKey.view.field.rpmLimit': { zh: 'RPM 限制', en: 'RPM Limit' },
  'virtualKey.view.field.tpmLimit': { zh: 'TPM 限制', en: 'TPM Limit' },
  'virtualKey.view.field.rpmLimitType': { zh: 'RPM 模式', en: 'RPM Mode' },
  'virtualKey.view.field.tpmLimitType': { zh: 'TPM 模式', en: 'TPM Mode' },
  'virtualKey.view.field.autoRotate': { zh: '自动轮换', en: 'Auto Rotate' },
  'virtualKey.view.field.rotationInterval': { zh: '轮换周期', en: 'Rotation Interval' },
  'virtualKey.view.field.lastActiveAt': { zh: '最近活动', en: 'Last Active' },
  'virtualKey.view.field.createdAt': { zh: '创建时间', en: 'Created' },
  'virtualKey.view.field.updatedAt': { zh: '更新时间', en: 'Updated' },
  'virtualKey.view.emptyValue': { zh: '—', en: '—' },
  'virtualKey.view.boolean.enabled': { zh: '是', en: 'Yes' },
  'virtualKey.view.boolean.disabled': { zh: '否', en: 'No' },
  'virtualKey.selected': { zh: '已选 {count} 项', en: '{count} selected' },
  'virtualKey.pagination.pageSize': { zh: '每页条数', en: 'Per page' },
  'virtualKey.pagination.summary': {
    zh: '显示 {start}-{end} 条，共 {total} 条',
    en: 'Showing {start}-{end} of {total}',
  },
  'virtualKey.pagination.label': { zh: '令牌分页', en: 'Virtual key pagination' },
  'virtualKey.form.createTitle': { zh: '颁发密钥', en: 'New API Key' },
  // Clone-modal title. Rendered when the form opens with mode='clone';
  // sits alongside createTitle (VirtualKeyFormModal picks one based on
  // the formMode passed by the parent).
  'virtualKey.form.cloneTitle': { zh: '克隆令牌', en: 'Clone Virtual Key' },
  // Inline asterisk rendered next to labels of backend-required
  // fields (密钥名称 / 所属组织 / 模型网关 / 可调用模型 — see
  // VirtualKeyFormModal template). Mirrors the
  // `gateway.form.requiredMark` convention so all create-flow
  // modals in the app share the same red-star UX.
  'virtualKey.form.requiredMark': { zh: '*', en: '*' },
  'virtualKey.form.name': { zh: '密钥名称', en: 'Key Name' },
  'virtualKey.form.namePlaceholder': {
    zh: '例如 OpenClaw_Robot_Key',
    en: 'e.g. OpenClaw_Robot_Key',
  },
  'virtualKey.form.cancel': { zh: '取消', en: 'Cancel' },
  'virtualKey.form.submit': { zh: '颁发', en: 'Issue' },
  'virtualKey.form.gateway': { zh: '模型网关', en: 'Model Gateway' },
  'virtualKey.form.gatewayPlaceholder': {
    zh: '请选择模型网关',
    en: 'Select a model gateway',
  },
  'virtualKey.form.gatewayRequired': {
    zh: '请选择模型网关',
    en: 'Please select a model gateway',
  },
  'virtualKey.form.duration': { zh: '有效时长', en: 'Duration' },
  'virtualKey.form.durationPlaceholder': {
    zh: '例如 30d',
    en: 'e.g. 30d',
  },
  'virtualKey.form.durationHint': {
    zh: '留空表示永不过期,例如 30d',
    en: 'Leave empty for no expiry, e.g. 30d',
  },
  'virtualKey.form.durationUnit': { zh: '单位', en: 'Unit' },
  'virtualKey.form.durationUnitHour': { zh: '小时 (h)', en: 'Hour (h)' },
  'virtualKey.form.durationUnitDay': { zh: '天 (d)', en: 'Day (d)' },
  'virtualKey.form.durationUnitWeek': { zh: '周 (w)', en: 'Week (w)' },
  'virtualKey.form.durationUnitMonth': { zh: '月 (m)', en: 'Month (m)' },
  'virtualKey.form.rotationIntervalUnit': { zh: '单位', en: 'Unit' },
  'virtualKey.form.rotationIntervalUnitSecond': {
    zh: '秒 (s)',
    en: 'Second (s)',
  },
  'virtualKey.form.rotationIntervalUnitMinute': {
    zh: '分钟 (m)',
    en: 'Minute (m)',
  },
  'virtualKey.form.rotationIntervalUnitHour': { zh: '小时 (h)', en: 'Hour (h)' },
  'virtualKey.form.rotationIntervalUnitDay': { zh: '天 (d)', en: 'Day (d)' },
  'virtualKey.form.nameRequired': {
    zh: '名称长度应为 2–64 个字符',
    en: 'Name must be 2–64 characters',
  },
  // Live duplicate hint shown next to the name input — surfaces a
  // backend partial-unique-index hit before the user even clicks
  // submit. Sits below the input as a `warning` status, not `error`,
  // because the modal's `formValid` already gates submission.
  'virtualKey.form.nameDuplicate': {
    zh: '该名称已被使用,请换一个',
    en: 'Name already in use — pick another',
  },
  'virtualKey.form.modelsRequired': {
    zh: '请至少选择一个可调用模型',
    en: 'Please select at least one model.',
  },
  'virtualKey.form.modelsHint': {
    zh: '选择网关后加载可用模型',
    en: 'Models load after selecting a gateway',
  },
  'virtualKey.confirm.deleteTitle': { zh: '确认删除密钥', en: 'Delete API Key' },
  'virtualKey.confirm.deleteBody': {
    zh: '确定要删除密钥“{name}”吗？此操作无法撤销。',
    en: 'Delete key “{name}”? This action cannot be undone.',
  },
  'virtualKey.confirm.batchDeleteTitle': { zh: '确认批量删除', en: 'Delete Selected Keys' },
  'virtualKey.confirm.batchDeleteBody': {
    zh: '确定要删除选中的 {count} 个密钥吗？此操作无法撤销。',
    en: 'Delete the selected {count} keys? This action cannot be undone.',
  },
  // Purge-path confirm. Title is deliberately *not* day-specific —
// the operator can edit the cutoff in the dialog's number input
// before confirming, so we don't bake a value into the title
// (otherwise a stale "确认清理 90 天前..." would mislead if the
// operator went on to type 180). Body similarly avoids naming the
// days; the number input itself is the visible source of truth for
// the cutoff at confirm time. CN keeps the day-agnostic wording; EN
// retains "revoked keys" since it's the natural English term.
'virtualKey.confirm.purgeTitle': {
    zh: '确认清理已吊销的令牌',
    en: 'Purge revoked keys',
  },
  'virtualKey.confirm.purgeBody': {
    zh: '将永久删除输入天数之前所有已吊销的令牌,此操作不可恢复。',
    en: 'Permanently delete every revoked key updated more than the entered number of days ago. This action cannot be undone.',
  },
  // Numeric-input labels for the purge confirm dialog. Surfaced as a
  // separate key (not interpolated into the title/body) so the input
  // field can render in its own slot without forcing the body text to
  // mention it twice.
  'virtualKey.confirm.purgeDaysLabel': {
    zh: '截止天数(天)',
    en: 'Cutoff (days)',
  },
  'virtualKey.confirm.purgeDaysPlaceholder': {
    zh: '例如 90',
    en: 'e.g. 90',
  },
  // Type-to-confirm prompt for single-row delete. The operator must
  // type the key's name exactly before the confirm button enables.
  // Multi-row deletion skips this step (no single label) and falls
  // back to a plain cancel/confirm dialog.
  'virtualKey.confirm.deleteInputLabel': { zh: '密钥名称', en: 'Key Name' },
  'virtualKey.confirm.deleteInputPlaceholder': {
    zh: '输入密钥名称以确认',
    en: 'Type the key name to confirm',
  },
  // Type-to-confirm prompt for batch delete. We use a fixed sentinel
  // `DELETE` (no localization) so the operator always types the same
  // characters regardless of UI language, and we don't have to fight
  // pluralization in the placeholder string. The label explains the
  // sentinel in the operator's UI language.
  'virtualKey.confirm.batchDeleteInputLabel': {
    zh: '输入 DELETE 以确认',
    en: 'Type DELETE to confirm',
  },
  'virtualKey.confirm.batchDeleteInputPlaceholder': {
    zh: '请输入 DELETE（大写）',
    en: 'Type DELETE (uppercase)',
  },
  'virtualKey.confirm.batchDeleteSentinel': { zh: 'DELETE', en: 'DELETE' },
  // Enable / disable confirm prompts. Single-row wording names the key;
  // batch wording names the count. Action phrasing tracks the target
  // state (enable vs disable) so the dialog reads naturally in both
  // directions.
  'virtualKey.confirm.enableTitle': { zh: '确认启用密钥', en: 'Enable API Key' },
  'virtualKey.confirm.enableBody': {
    zh: '确定要启用密钥“{name}”吗？',
    en: 'Enable key “{name}”?',
  },
  'virtualKey.confirm.disableTitle': { zh: '确认禁用密钥', en: 'Disable API Key' },
  'virtualKey.confirm.disableBody': {
    zh: '确定要禁用密钥“{name}”吗？已发出的密钥将立即停止接受请求。',
    en: 'Disable key “{name}”? Issued credentials will stop accepting requests immediately.',
  },
  'virtualKey.confirm.batchEnableTitle': { zh: '确认批量启用', en: 'Enable Selected Keys' },
  'virtualKey.confirm.batchEnableBody': {
    zh: '确定要启用选中的 {count} 个密钥吗？',
    en: 'Enable the selected {count} keys?',
  },
  'virtualKey.confirm.batchDisableTitle': { zh: '确认批量禁用', en: 'Disable Selected Keys' },
  'virtualKey.confirm.batchDisableBody': {
    zh: '确定要禁用选中的 {count} 个密钥吗？已发出的密钥将立即停止接受请求。',
    en: 'Disable the selected {count} keys? Issued credentials will stop accepting requests immediately.',
  },
  'virtualKey.toast.created': { zh: '令牌已创建', en: 'Virtual key created' },
  // Clone-path toast — surfaces both the source label and the freshly
  // typed target label so the operator can confirm they didn't paste
  // into the wrong row. {source} / {target} are substituted by
  // VirtualKeyView's openClone handler via .replace() — see
  // ModelGatewayView for the same idiom.
  'virtualKey.toast.clonedFrom': {
    zh: '已基于「{source}」克隆出新令牌「{target}」',
    en: 'Cloned "{source}" into "{target}"',
  },
  // Generic clone failure surface — backend errors include things
  // like "models not available on modelGateway" when the source
  // referenced models the chosen gateway no longer serves. {reason}
  // is filled from graphqlErrorMessage().
  'virtualKey.toast.cloneFailed': {
    zh: '克隆失败：{reason}',
    en: 'Clone failed: {reason}',
  },
  'virtualKey.toast.updated': { zh: '令牌已更新', en: 'Virtual key updated' },
  'virtualKey.toast.enabled': {
    zh: '已启用 {count} 个令牌',
    en: 'Enabled {count} virtual keys',
  },
  'virtualKey.toast.disabled': {
    zh: '已禁用 {count} 个令牌',
    en: 'Disabled {count} virtual keys',
  },
  'virtualKey.toast.deleted': {
    zh: '已删除 {count} 个令牌',
    en: 'Deleted {count} virtual keys',
  },
  // Purge-path toasts — `{count}` is the number of rows the resolver
  // physically deleted (NOT the number of revoked keys the operator
  // saw, which could be different if some rows are newer than the
  // cutoff).
  'virtualKey.toast.purged': {
    zh: '已清除 {count} 条已吊销的令牌',
    en: 'Purged {count} revoked keys',
  },
  'virtualKey.toast.purgeFailed': {
    zh: '清理失败',
    en: 'Purge failed',
  },
  'virtualKey.toast.maskedCopied': { zh: '令牌掩码已复制', en: 'Masked key copied' },
  'virtualKey.toast.keyCopied': { zh: '令牌已复制到剪贴板', en: 'Key copied to clipboard' },
  'virtualKey.toast.agentCopied': { zh: '智能体 ID 已复制', en: 'Agent ID copied' },
  'virtualKey.toast.copyFailed': { zh: '复制失败', en: 'Copy failed' },
  'virtualKey.toast.refreshed': { zh: '令牌列表已刷新', en: 'Virtual key list refreshed' },
  'virtualKey.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
  'virtualKey.toast.saveFailed': { zh: '保存失败', en: 'Failed to save' },
  'virtualKey.toast.issueFailed': { zh: '签发令牌失败', en: 'Failed to issue key' },
  'virtualKey.toast.revokeFailed': { zh: '吊销令牌失败', en: 'Failed to revoke key' },
  'virtualKey.status.revoked': { zh: '已吊销', en: 'Revoked' },
  'virtualKey.form.maxBudget': { zh: '最大预算（maxBudget）', en: 'Max Budget (maxBudget)' },
  'virtualKey.form.budgetControl': { zh: '预算控制', en: 'Budget Control' },
  // Master toggle that gates the four TPM/RPM fields below. Mirrors the
  // design pattern used by `budgetControl` (also a Toggle → conditions
  // the wire payload). When OFF, the resolver applies LiteLLM's no-cap
  // default; when ON, the four child fields become editable.
  'virtualKey.form.rateLimitControl': { zh: '设置限额', en: 'Rate Limits' },
  'virtualKey.form.models': { zh: '选择可调用模型', en: 'Select Models' },
  'virtualKey.form.modelsEmpty': {
    zh: '暂无可用模型，请先选择网关',
    en: 'No available models yet — select a gateway first',
  },
  'virtualKey.form.modelsLoading': {
    zh: '正在加载可用模型…',
    en: 'Loading available models…',
  },
  'virtualKey.form.modelsEmptyAfterPick': {
    zh: '该网关暂无可用模型',
    en: 'This gateway has no available models',
  },
  'virtualKey.form.advanced': { zh: '高级参数', en: 'Advanced' },
  'virtualKey.form.tpmLimit': { zh: '每分钟 Tokens（tpm）', en: 'Tokens per Minute (tpm)' },
  'virtualKey.form.tpmLimitType': { zh: 'TPM 限流模式', en: 'TPM Limit Type' },
  'virtualKey.form.rpmLimit': { zh: '每分钟 请求（rpm）', en: 'Requests per Minute (rpm)' },
  'virtualKey.form.rpmLimitType': { zh: 'RPM 限流模式', en: 'RPM Limit Type' },
  // Shared option titles + descriptions for the rate-limit-type radio
  // picker (LiteLLM design doc §4.2). Each picker (TPM / RPM) renders
  // the same three options; only the legend label differs above.
  'virtualKey.form.rateLimitType.best_effort_throughput.title': {
    zh: '默认',
    en: 'Default',
  },
  'virtualKey.form.rateLimitType.best_effort_throughput.desc': {
    zh: '尽力调度,即使超出 TPM 也不报错(超限检查在请求时按 Team/Key 限额执行)。',
    en:
      'Best effort throughput - no error if we\'re overallocating tpm ' +
      '(Team/Key Limits checked at runtime).',
  },
  'virtualKey.form.rateLimitType.guaranteed_throughput.title': {
    zh: '保证吞吐',
    en: 'Guaranteed throughput',
  },
  'virtualKey.form.rateLimitType.guaranteed_throughput.desc': {
    zh: '保证吞吐,超出 TPM 时报错(同时检查模型自身限额)。',
    en:
      'Guaranteed throughput - raise an error if we\'re overallocating ' +
      'tpm (also checks model-specific limits).',
  },
  'virtualKey.form.rateLimitType.dynamic.title': {
    zh: '动态',
    en: 'Dynamic',
  },
  'virtualKey.form.rateLimitType.dynamic.desc': {
    zh: '在 429 错误未出现时,可动态超出已设置的 TPM 限额(若设了 TPM)。',
    en:
      'If the key has a set TPM (e.g. 2 TPM) and there are no 429 errors, ' +
      'it can dynamically exceed the limit.',
  },
  'virtualKey.form.maxParallelRequests': { zh: '最大并发请求', en: 'Max Parallel Requests' },
  'virtualKey.form.budgetDuration': { zh: '预算周期（budgetDuration）', en: 'Budget Duration (budgetDuration)' },
  'virtualKey.form.budgetDurationPlaceholder': { zh: '例如 1', en: 'e.g. 1' },
  'virtualKey.form.budgetDurationUnit': { zh: '单位', en: 'Unit' },
  'virtualKey.form.budgetDurationUnitSecond': { zh: '秒 (s)', en: 'Second (s)' },
  'virtualKey.form.budgetDurationUnitMinute': { zh: '分钟 (m)', en: 'Minute (m)' },
  'virtualKey.form.budgetDurationUnitHour': { zh: '小时 (h)', en: 'Hour (h)' },
  'virtualKey.form.budgetDurationUnitDay': { zh: '天 (d)', en: 'Day (d)' },
  'virtualKey.form.budgetDurationUnitMonth': { zh: '月 (mo)', en: 'Month (mo)' },
  'virtualKey.form.tags': { zh: '模型标签', en: 'Tags' },
  'virtualKey.form.tagsPlaceholder': {
    zh: '逗号分隔,例如 prod,priority-high',
    en: 'comma-separated, e.g. prod,priority-high',
  },
  'virtualKey.form.rotationInterval': { zh: '自动轮换周期', en: 'Rotation Interval' },
  'virtualKey.form.rotationIntervalPlaceholder': { zh: '例如 12h', en: 'e.g. 12h' },
  'virtualKey.form.autoRotate': { zh: '自动轮换', en: 'Auto Rotate' },
  'virtualKey.form.allowedRoutes': { zh: '接口权限', en: 'Route Permissions' },
  'virtualKey.form.allowAllRoutes': { zh: '允许所有接口', en: 'Allow All APIs' },
  'virtualKey.form.allowedRoutesError': {
    zh: '至少选择一个接口或开启"允许所有接口"',
    en: 'Select at least one route or enable "Allow All APIs"',
  },
  'virtualKey.allowedRoutes.CHAT': { zh: '对话 /v1/chat/completions', en: 'Chat /v1/chat/completions' },
  'virtualKey.allowedRoutes.EMBEDDINGS': {
    zh: '向量 /v1/embeddings',
    en: 'Embeddings /v1/embeddings',
  },
  'virtualKey.allowedRoutes.IMAGES': {
    zh: '画图 /v1/images/generations',
    en: 'Images /v1/images/generations',
  },
  'virtualKey.allowedRoutes.AUDIO': { zh: '语音 /v1/audio/*', en: 'Audio /v1/audio/*' },
  'virtualKey.secret.title': { zh: '请立即保存密钥', en: 'Save your key now' },
  'virtualKey.secret.warning': {
    zh: '该密钥仅显示这一次，对话框关闭后将无法再次查看，请妥善保存。',
    en: 'This secret is shown only once — you will not be able to view it again after closing this dialog.',
  },
  'virtualKey.secret.copy': { zh: '复制密钥', en: 'Copy key' },
  'virtualKey.secret.copied': { zh: '密钥已复制到剪贴板', en: 'Key copied to clipboard' },
  'virtualKey.secret.done': { zh: '我已保存', en: 'Done' },

  'supplier.title': { zh: '模型管理', en: 'Model Management' },
  'supplier.description': {
    zh: '管理上游供应商提供的模型配置（鉴权、速率与计费参数），控制平台侧接入门禁与健康探测。',
    en: 'Manage upstream supplier model configurations (auth, rate, and billing parameters) that gate platform-side ingress and the health probe.',
  },
  'supplier.table.label': { zh: '模型列表', en: 'Models' },
  'supplier.sort': { zh: '排序：{column}', en: 'Sort {column}' },
  'supplier.filter': { zh: '过滤：{column}', en: 'Filter {column}' },
  'supplier.filter.clear': { zh: '清除过滤', en: 'Clear filter' },
  'supplier.filter.namePlaceholder': { zh: '输入模型名称', en: 'Enter model name' },
  'supplier.filter.status.ALL': { zh: '全部状态', en: 'All statuses' },
  'supplier.filter.status.ENABLED': { zh: '启用', en: 'Enabled' },
  'supplier.filter.status.DISABLED': { zh: '未启用', en: 'Disabled' },
  'supplier.filter.gateway.ALL': { zh: '全部模型网关', en: 'All gateways' },
  'supplier.action.create': { zh: '新建模型', en: 'New Model' },
  'supplier.action.batch': { zh: '批量操作', en: 'Batch Actions' },
  'supplier.action.refresh': { zh: '刷新', en: 'Refresh' },
  'supplier.action.test': { zh: '探测', en: 'Probe' },
  'supplier.action.checkHealth': { zh: '检测健康', en: 'Check Health' },
  'supplier.action.edit': { zh: '编辑', en: 'Edit' },
  'supplier.action.apply': { zh: '应用至…', en: 'Apply To…' },
  'supplier.action.enable': { zh: '启用', en: 'Enable' },
  'supplier.action.disable': { zh: '禁用', en: 'Disable' },
  'supplier.action.delete': { zh: '删除', en: 'Delete' },
  'supplier.action.manageSpecs': {
    zh: '管理供应商模型',
    en: 'Manage Provider Models',
  },
  'supplier.batch.enable': { zh: '批量启用', en: 'Enable Selected' },
  'supplier.batch.disable': { zh: '批量禁用', en: 'Disable Selected' },
  'supplier.batch.delete': { zh: '批量删除', en: 'Delete Selected' },
  'supplier.batch.disabled': { zh: '请先选择模型', en: 'Select models first' },
  'supplier.col.selectAll': { zh: '选择当前页全部模型', en: 'Select all models on this page' },
  'supplier.col.name': { zh: '模型名称', en: 'Model Name' },
  'supplier.col.provider': { zh: '供应商', en: 'Provider' },
  'supplier.col.model': { zh: '模型', en: 'Model' },
  'supplier.col.health': { zh: '健康状态', en: 'Health' },
  'supplier.col.status': { zh: '状态', en: 'Status' },
  'supplier.col.actions': { zh: '操作', en: 'Actions' },
  'supplier.status.enabled': { zh: '启用', en: 'Enabled' },
  'supplier.status.disabled': { zh: '未启用', en: 'Disabled' },
  'supplier.empty': { zh: '暂无模型', en: 'No models' },
  'supplier.selected': { zh: '已选 {count} 项', en: '{count} selected' },
  'supplier.pagination.pageSize': { zh: '每页条数', en: 'Per page' },
  'supplier.pagination.summary': {
    zh: '显示 {start}-{end} 条，共 {total} 条',
    en: 'Showing {start}-{end} of {total}',
  },
  'supplier.pagination.label': { zh: '模型分页', en: 'Model pagination' },
  'supplier.form.name': { zh: '模型名称', en: 'Model Name' },
  'supplier.form.namePlaceholder': {
    zh: '例如 agent_openclaw_limit',
    en: 'e.g. agent_openclaw_limit',
  },
  'supplier.form.nameError': {
    zh: '名称长度应为 2–64 个字符。',
    en: 'Name must be 2–64 characters.',
  },
  'supplier.form.type': { zh: '限制类型', en: 'Limit Type' },
  'supplier.form.tokenLimit': { zh: '每分钟 Token 数（TPM）', en: 'Tokens per Minute (TPM)' },
  'supplier.form.requestLimit': { zh: '每分钟请求数（RPM）', en: 'Requests per Minute (RPM)' },
  'supplier.form.enabled': { zh: '创建后立即启用', en: 'Enable immediately' },
  'supplier.form.cancel': { zh: '取消', en: 'Cancel' },
  'supplier.form.submit': { zh: '保存', en: 'Save' },
  'supplier.type.TOKEN': { zh: 'Token 限制', en: 'Token Limit' },
  'supplier.type.REQUEST': { zh: '请求数限制', en: 'Request Limit' },
  'supplier.type.COMBINED': { zh: '组合限制', en: 'Combined Limit' },
  // ProviderModel-specific (供应商模型) — reuses the supplier.* prefix but
  // everything below the model.* separator is the new form/column copy
  // introduced by the LiteLLM design doc §2.2 refactor. SupplierModelView
  // and the form modal now consume only the supplier.model.* set; the
  // remaining supplier.* keys (e.g. supplier.title / supplier.col.name /
  // supplier.pagination.pageSize) are general page chrome shared by the
  // list view.
  'supplier.model.col.provider': { zh: '供应商分类', en: 'Provider' },
  'supplier.model.col.model': { zh: '上游模型原名', en: 'Upstream Model' },
  'supplier.model.col.health': { zh: '健康状态', en: 'Health' },
  'supplier.model.col.selectModel': { zh: '选择供应商 {name}', en: 'Select model {name}' },
  'supplier.model.filter.status.ACTIVE': { zh: '健康', en: 'Active' },
  'supplier.model.filter.status.DEGRADED': { zh: '降级', en: 'Degraded' },
  'supplier.model.filter.status.MELTED': { zh: '熔断', en: 'Melted' },
  'supplier.model.filter.status.UNKNOWN': { zh: '未探测', en: 'Unknown' },
  'supplier.model.status.active': { zh: '健康', en: 'Active' },
  'supplier.model.status.degraded': { zh: '降级', en: 'Degraded' },
  'supplier.model.status.melted': { zh: '熔断', en: 'Melted' },
  'supplier.model.status.unknown': { zh: '未探测', en: 'Unknown' },
  'supplier.model.action.test': { zh: '探测', en: 'Probe' },
  'supplier.model.action.block': { zh: '熔断', en: 'Block' },
  'supplier.model.action.unblock': { zh: '解除熔断', en: 'Unblock' },
  'supplier.model.form.createTitle': { zh: '新建模型', en: 'New Model' },
  'supplier.model.form.editTitle': { zh: '编辑供应商模型', en: 'Edit Provider Model' },
  'supplier.model.form.name': { zh: '模型名称', en: 'Model name' },
  'supplier.model.form.namePlaceholder': { zh: '例如 DeepSeek-V3.1', en: 'e.g. DeepSeek-V3.1' },
  'supplier.model.form.nameError': {
    zh: '模型名仅允许大小写字母、数字、中划线与点',
    en: 'Model name may only contain letters, digits, hyphens, and dots',
  },
  'supplier.model.form.nameHint': {
    zh: '大小写字母、数字、中划线与点，2-64 字符',
    en: 'Letters, digits, hyphens, and dots, 2-64 chars',
  },
  'supplier.model.form.requiredMark': { zh: '*', en: '*' },
  'supplier.model.form.nameLockedHint': {
    zh: '编辑时名称不可更改',
    en: 'Name cannot be changed when editing',
  },
  'supplier.model.form.provider': { zh: '供应商分类', en: 'Provider' },
  'supplier.model.form.model': { zh: '上游模型原名', en: 'Upstream Model' },
  'supplier.model.form.modelPlaceholder': {
    zh: '例如 gpt-4o、claude-3-5-sonnet',
    en: 'e.g. gpt-4o, claude-3-5-sonnet',
  },
  'supplier.model.form.modelError': { zh: '上游模型原名不可为空', en: 'Model name is required' },
  'supplier.model.form.apiKey': { zh: 'API Key', en: 'API Key' },
  'supplier.model.form.apiKeyPlaceholder': { zh: '明文只用于本次提交', en: 'Plaintext used only for this submission' },
  'supplier.model.form.apiKeyError': { zh: '新增时 API Key 必填', en: 'API Key is required when creating' },
  'supplier.model.form.apiKeyHint': {
    zh: '后端加密入库,前端不再显示',
    en: 'Encrypted at rest, never displayed again',
  },
  'supplier.model.form.testConnection': { zh: '测试连接', en: 'Test Connection' },
  'supplier.model.form.testSuccess': {
    zh: '连接成功：获取到 {count} 个模型',
    en: 'Connected: fetched {count} models',
  },
  'supplier.model.form.testFailure': {
    zh: '连接失败：{message}',
    en: 'Connection failed: {message}',
  },
  'supplier.model.form.testFailed': { zh: '测试连接失败', en: 'Failed to test connection' },
  'supplier.model.form.enabled': { zh: '启用此节点', en: 'Enable this node' },
  'supplier.model.form.advanced': { zh: '模型高级参数', en: 'Advanced' },
  'supplier.model.form.specAdvanced': { zh: '供应商模型高级参数', en: 'Model Advanced' },
  'supplier.model.form.apiBase': { zh: 'API Base', en: 'API Base' },
  'supplier.model.form.apiBasePlaceholder': { zh: 'https://api.openai.com/v1', en: 'https://api.openai.com/v1' },
  'supplier.model.form.apiBaseHint': {
    zh: '编辑时暂只读;后续支持从 litellm_params 同步',
    en: 'Read-only here for now; syncs with litellm_params',
  },
  'supplier.model.form.organization': { zh: '所属组织', en: 'Organization' },
  'supplier.model.form.organizationPlaceholder': { zh: '例如 org-abc123', en: 'e.g. org-abc123' },
  'supplier.model.form.organizationLockedHint': {
    zh: '行级字段,在编辑模式下不可改',
    en: 'Row-level; locked in edit mode',
  },
  'supplier.model.form.organizationError': {
    zh: '组织不可为空',
    en: 'Organization is required',
  },
  'supplier.model.form.tags': { zh: 'Tags (逗号分隔)', en: 'Tags (comma-separated)' },
  'supplier.model.form.tagsPlaceholder': { zh: '例如 prod,priority-high', en: 'e.g. prod,priority-high' },
  'supplier.model.form.cancel': { zh: '取消', en: 'Cancel' },
  'supplier.model.form.submit': { zh: '保存', en: 'Save' },
  'supplier.model.form.step.basic': { zh: '基本', en: 'Basic' },
  'supplier.model.form.step.specs': { zh: '供应商模型', en: 'Provider models' },
  'supplier.model.form.step.review': { zh: '确认并提交', en: 'Review & submit' },
  'supplier.model.form.stepIndicator': {
    zh: '第 {current} 步 / 共 {total} 步 — {label}',
    en: 'Step {current} of {total} — {label}',
  },
  'supplier.model.form.back': { zh: '上一步', en: 'Back' },
  'supplier.model.form.next': { zh: '下一步', en: 'Next' },
  'supplier.model.form.submitCreate': { zh: '提交创建', en: 'Create' },
  'supplier.model.form.submitUpdate': { zh: '保存修改', en: 'Save changes' },
  'supplier.model.form.review.basic': { zh: '基本信息', en: 'Basic information' },
  // Mirror the exact label keys used on the basic + specs steps so the
  // confirmation page reads identically to the inputs above it. Earlier
  // review.* entries diverged ("网关" vs. "模型网关", "apiBase" vs.
  // "API 地址", etc.), forcing users to mentally translate one set of
  // labels to another right before they hit Submit.
  'supplier.model.form.review.name': { zh: '模型名称', en: 'Model name' },
  'supplier.model.form.review.gateway': { zh: '模型网关', en: 'Model gateway' },
  'supplier.model.form.review.organization': { zh: '所属组织', en: 'Organization' },
  'supplier.model.form.review.specsCount': { zh: '{count} 个', en: '{count}' },
  'supplier.model.form.review.specHeading': { zh: '模型 #{n}', en: 'Model #{n}' },
  'supplier.model.form.review.model': { zh: '选择模型', en: 'Model' },
  'supplier.model.form.review.customLlmProvider': {
    zh: '供应商',
    en: 'Provider',
  },
  'supplier.model.form.review.apiBase': { zh: 'API 地址', en: 'API base' },
  'supplier.model.form.review.tags': { zh: '模型标签', en: 'Model tags' },
  // 「限流」 / 「单价(/token)」 stay review-only: the input step surfaces
  // them as four separate fields (TPM / RPM / maxBudget / budgetDuration,
  // and four cost-per-token fields) with no single umbrella label, so
  // the review summary cannot faithfully reuse a spec key.
  'supplier.model.form.review.limits': { zh: '限流', en: 'Limits' },
  'supplier.model.form.review.cost': { zh: '单价(/token)', en: 'Cost (per token)' },
  'supplier.model.form.review.unset': { zh: '(未设置)', en: '(not set)' },
  // API Key 在 review 步不展示明文,只展示轮换状态。创建模式:已设置新密钥;
  // 编辑模式:用户清空则保持原值(rotate=false),否则将轮换为新值(rotate=true)。
  'supplier.model.form.review.apiKey': { zh: 'API Key', en: 'API Key' },
  'supplier.model.form.review.apiKeySet': {
    zh: '已设置新密钥',
    en: 'New key will be set',
  },
  'supplier.model.form.review.apiKeyKeep': {
    zh: '保持原密钥',
    en: 'Current key kept',
  },
  'supplier.model.form.review.apiKeyRotate': {
    zh: '将轮换为新密钥',
    en: 'New key will replace current',
  },
  // 模型模式在 review 步展示:不指定 / 已知值 / 自定义值。
  'supplier.model.form.review.mode': { zh: '模型模式', en: 'Model mode' },
  // 三个独立 toggle(限流 / 单价 已是合并行,这里只补剩下的三个):
  // 透传模式 / 使用 chat completions 接口 / 合并 reasoning 到 choices。
  'supplier.model.form.review.toggleOn': { zh: '开', en: 'On' },
  'supplier.model.form.review.toggleOff': { zh: '关', en: 'Off' },
  'supplier.form.nameLockedHint': {
    zh: '编辑时名称不可更改',
    en: 'Name cannot be changed when editing',
  },

  // ─── supplier (ProviderModel new surface, R1–R10) ─────────────────────
  // 4-bucket status — replaces the historical active/degraded/melted/unknown.
  'supplier.status.full_healthy': { zh: '全部健康', en: 'All healthy' },
  'supplier.status.partial_outage': { zh: '部分不可用', en: 'Partial outage' },
  'supplier.status.full_outage': { zh: '全部不可用', en: 'Full outage' },
  'supplier.status.unknown': { zh: '未知', en: 'Unknown' },

  // extra column / drawer copy
  'supplier.col.gateway': { zh: '所属模型网关', en: 'Model gateway' },
  'supplier.col.specs': { zh: '供应商模型', en: 'Provider models' },
  'supplier.col.lastCheckedAt': { zh: '最近检测时间', en: 'Last checked' },
  'supplier.col.checkedAgo': { zh: '{ago}前检查', en: 'Checked {ago} ago' },
  'supplier.col.createdAt': { zh: '创建时间', en: 'Created at' },
  'supplier.col.updatedAt': { zh: '更新时间', en: 'Updated at' },
  'supplier.col.organization': { zh: '所属组织', en: 'Organization' },

  // Specs drawer (new component, see Task 6)
  'supplier.specs.title': {
    zh: '管理供应商模型 - {name}',
    en: 'Manage Provider Models - {name}',
  },
  'supplier.specs.empty': {
    zh: '该 ProviderModel 暂无模型',
    en: 'No models yet for this provider model',
  },
  'supplier.specs.add': { zh: '添加模型', en: 'Add model' },
  'supplier.specs.blockAll': { zh: '全部 block', en: 'Block all' },
  'supplier.specs.unblockAll': { zh: '全部 unblock', en: 'Unblock all' },
  'supplier.specs.refresh': { zh: '刷新', en: 'Refresh' },
  'supplier.specs.col.status': { zh: '状态', en: 'Status' },
  'supplier.specs.col.blocked': { zh: '禁用', en: 'Blocked' },
  'supplier.specs.metaCount': { zh: '个供应商模型', en: ' provider models' },

  'supplier.specs.addModal.title': { zh: '添加模型', en: 'Add model' },
  'supplier.specs.addModal.apiKeyHint': {
    zh: '留空保留原 key',
    en: 'Leave blank to keep existing key',
  },
  'supplier.specs.addModal.modelPlaceholder': {
    zh: '上游模型名，如 deepseek-chat',
    en: 'Upstream model name, e.g. deepseek-chat',
  },
  'supplier.specs.addModal.customLlmProviderPlaceholder': {
    zh: 'Litellm provider，如 deepseek',
    en: 'Litellm provider, e.g. deepseek',
  },
  'supplier.specs.addModal.providerPlaceholder': {
    zh: '请选择供应商',
    en: 'Select a provider',
  },
  'supplier.specs.addModal.apiKeyPlaceholder': {
    zh: '明文 key(仅写入,wire 上只回 apiKeyRef)',
    en: 'Plaintext key (write-only; apiKeyRef is the read-side ref)',
  },
  'supplier.specs.addModal.submit': { zh: '添加', en: 'Add' },

  'supplier.specs.toast.added': { zh: '已添加模型', en: 'Model added' },
  'supplier.specs.toast.deleted': { zh: '已删除模型', en: 'Model deleted' },
  'supplier.specs.toast.refreshed': { zh: '状态已刷新', en: 'Status refreshed' },
  'supplier.specs.toast.blocked': {
    zh: '已 block {count} 个模型',
    en: 'Blocked {count} models',
  },
  'supplier.specs.toast.unblocked': {
    zh: '已 unblock {count} 个模型',
    en: 'Unblocked {count} models',
  },

  // ProviderModel (供应商模型) toast messages — separate from supplier.* so
  // the model view's user-facing copy (e.g. created / refreshed) doesn't
  // collide with the general page chrome in the supplier.* keys above.
  'supplier.model.toast.created': { zh: '供应商模型已创建', en: 'Provider model created' },
  'supplier.model.toast.updated': { zh: '供应商模型已更新', en: 'Provider model updated' },
  'supplier.model.toast.refreshed': { zh: '供应商模型已刷新', en: 'Provider model refreshed' },
  'supplier.model.toast.healthChecked': { zh: '健康检测完成', en: 'Health check completed' },
  'supplier.model.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
  'supplier.model.toast.deleteFailed': { zh: '删除失败', en: 'Failed to delete model' },
  'supplier.model.toast.deleted': { zh: '供应商模型已删除', en: 'Provider model deleted' },
  'supplier.model.toast.batchEnabled': { zh: '已启用 {count} 个模型', en: 'Enabled {count} models' },
  'supplier.model.toast.batchDisabled': { zh: '已禁用 {count} 个模型', en: 'Disabled {count} models' },
  'supplier.model.confirm.deleteTitle': {
    zh: '删除供应商模型',
    en: 'Delete Provider Model',
  },
  'supplier.model.confirm.deleteBody': {
    zh: '确定要删除模型 “{name}” 吗？此操作无法撤销。请输入模型名称以确认。',
    en: 'Delete model “{name}”? This action cannot be undone. Type the model name to confirm.',
  },
  'supplier.model.confirm.batchDeleteTitle': {
    zh: '批量删除供应商模型',
    en: 'Delete Selected Provider Models',
  },
  'supplier.model.confirm.batchDeleteBody': {
    zh: '确定要删除选中的 {count} 个供应商模型吗？此操作无法撤销。请输入 “{token}” 以确认。',
    en: 'Delete the selected {count} provider models? This action cannot be undone. Type “{token}” to confirm.',
  },
  'supplier.model.confirm.tokenPlaceholder': {
    zh: '输入确认文本',
    en: 'Type the confirmation text',
  },
  // Per-spec delete (inside the manage-supplier-model modal). Asking the
  // user to type the spec's model name (e.g. "MiniMax-M3") is the same
  // type-to-confirm pattern used for the row-level delete — small
  // friction that prevents clicking past the dialog by accident.
  'supplier.model.confirm.specDeleteTitle': {
    zh: '删除供应商模型规格',
    en: 'Delete Provider Model Spec',
  },
  'supplier.model.confirm.specDeleteBody': {
    zh: '确定要删除该模型 “{name}” 吗？此操作无法撤销。请输入规格名称以确认。',
    en: 'Delete model “{name}”? This action cannot be undone. Type the spec name to confirm.',
  },

  // Read-only "view specs" modal triggered from the model list's eye icon.
  // Surfaces every spec's litellmParams.modelInfo field the form modal
  // shows in its review step, plus a few the form recaps in compact
  // composite summaries (cost, limits) — here they're broken out per
  // column so admins can audit any single field without paging.
  'supplier.viewModal.title': { zh: '查看 {name} 的供应商模型', en: 'Specs of {name}' },
  'supplier.viewModal.close': { zh: '关闭', en: 'Close' },
  'supplier.viewModal.col.model': { zh: '选择模型', en: 'Model' },
  'supplier.viewModal.col.provider': { zh: '供应商', en: 'Provider' },
  'supplier.viewModal.col.apiBase': { zh: 'API 地址', en: 'API Base' },
  'supplier.viewModal.col.blocked': { zh: '是否禁用', en: 'Blocked' },
  'supplier.viewModal.col.mode': { zh: '模型模式', en: 'Mode' },
  'supplier.viewModal.col.tags': { zh: '模型标签', en: 'Model tags' },
  'supplier.viewModal.col.cost': { zh: '模型定价', en: 'Cost' },
  'supplier.viewModal.col.limits': { zh: '模型限额', en: 'Limits' },
  'supplier.viewModal.col.passThrough': { zh: '透传模式', en: 'Pass-through' },
  'supplier.viewModal.col.chatApi': { zh: '使用 chat completions 接口', en: 'Use chat completions API' },
  'supplier.viewModal.col.mergeReasoning': { zh: '合并 reasoning 到 choices', en: 'Merge reasoning into choices' },
  'supplier.viewModal.yes': { zh: '是', en: 'Yes' },
  'supplier.viewModal.no': { zh: '否', en: 'No' },
  'supplier.action.view': { zh: '查看', en: 'View' },

  // Form fields (rewritten for create / edit / specs array editor)
  'supplier.model.form.gateway': { zh: '模型网关', en: 'Model gateway' },
  'supplier.model.form.gatewayPlaceholder': {
    zh: '请选择模型网关',
    en: 'Select a model gateway',
  },
  'supplier.model.form.gatewayLockedHint': {
    zh: '编辑时不可更改',
    en: 'Cannot be changed during edit',
  },
  'supplier.model.form.specs': { zh: '供应商模型', en: 'Provider models' },
  'supplier.model.form.specsHint': {
    zh: '',
    en: '',
  },
  'supplier.model.form.spec.addSpec': { zh: '添加模型', en: 'Add model' },
  'supplier.model.form.spec.removeSpec': { zh: '移除该模型', en: 'Remove this model' },
  'supplier.model.form.spec.apiKey': { zh: 'API Key', en: 'API Key' },
  'supplier.model.form.spec.apiKeyPlaceholder': {
    zh: '留空保留原 key',
    en: 'Leave blank to keep existing key',
  },
  'supplier.model.form.spec.customLlmProvider': {
    zh: '供应商',
    en: 'Provider',
  },
  'supplier.model.form.spec.customLlmProviderHint': {
    zh: '选择预定义供应商后,API Base 会自动填充,仍可手动修改',
    en: 'Pick a provider to auto-fill the API base URL (still editable).',
  },
  'supplier.model.form.spec.provider': { zh: '供应商', en: 'Provider' },
  'supplier.model.form.spec.providerPlaceholder': {
    zh: '请选择供应商',
    en: 'Select a provider',
  },
  'supplier.model.form.spec.providerOption.custom': {
    zh: '自定义供应商',
    en: 'Custom',
  },
  'supplier.model.form.spec.providerOption.deepseek': {
    zh: 'DeepSeek',
    en: 'DeepSeek',
  },
  'supplier.model.form.spec.providerOption.minimax': {
    zh: 'MiniMax',
    en: 'MiniMax',
  },
  'supplier.model.form.spec.providerOption.moonshot': {
    zh: 'Moonshot(月之暗面)',
    en: 'Moonshot',
  },
  'supplier.model.form.spec.providerOption.openrouter': {
    zh: 'OpenRouter(多模型聚合)',
    en: 'OpenRouter',
  },
  'supplier.model.form.spec.providerOption.openai': {
    zh: 'openai',
    en: 'openai',
  },
  'supplier.model.form.spec.providerOption.anthropic': {
    zh: 'anthropic',
    en: 'anthropic',
  },
  'supplier.model.form.spec.apiBase': { zh: 'API 地址', en: 'API base' },
  'supplier.model.form.spec.apiBaseHint': {
    zh: '已根据供应商预填默认 URL,可按需修改',
    en: 'Auto-filled from provider default; editable.',
  },
  'supplier.model.form.spec.apiBaseHintCustom': {
    zh: '请填写 API Base URL',
    en: 'Enter the API base URL.',
  },
  'supplier.model.form.spec.mode': { zh: '模型模式', en: 'Model mode' },
  'supplier.model.form.spec.tags': { zh: '模型标签', en: 'Model tags' },
  // 模式(下拉选项)。后端为 free-form 字符串,目前未提供枚举,前端按
  // LiteLLM 常见取值给出常用项;保留"不指定"项(空串)以兼容历史/未列出值。
  'supplier.model.form.spec.modePlaceholder': {
    zh: '不指定(使用后端默认)',
    en: 'Unset (use backend default)',
  },
  'supplier.model.form.spec.modeOption.chat': {
    zh: 'Chat - /chat/completions(对话)',
    en: 'Chat - /chat/completions',
  },
  'supplier.model.form.spec.modeOption.completion': {
    zh: 'Completion - /completions(文本补全)',
    en: 'Completion - /completions',
  },
  'supplier.model.form.spec.modeOption.embedding': {
    zh: 'Embedding - /embeddings(向量化)',
    en: 'Embedding - /embeddings',
  },
  'supplier.model.form.spec.modeOption.audio_speech': {
    zh: 'Audio Speech - /audio/speech(文字转语音)',
    en: 'Audio Speech - /audio/speech',
  },
  'supplier.model.form.spec.modeOption.audio_transcription': {
    zh: 'Audio Transcription - /audio/transcriptions(语音转文字)',
    en: 'Audio Transcription - /audio/transcriptions',
  },
  'supplier.model.form.spec.modeOption.image_generation': {
    zh: 'Image Generation - /images/generations(图像生成)',
    en: 'Image Generation - /images/generations',
  },
  'supplier.model.form.spec.modeOption.video_generation': {
    zh: 'Video Generation - /videos(视频生成)',
    en: 'Video Generation - /videos',
  },
  'supplier.model.form.spec.modeOption.rerank': {
    zh: 'Rerank - /rerank(重排序)',
    en: 'Rerank - /rerank',
  },
  'supplier.model.form.spec.modeOption.realtime': {
    zh: 'Realtime - /realtime(实时接口)',
    en: 'Realtime - /realtime',
  },
  'supplier.model.form.spec.modeOption.batch': {
    zh: 'Batch - /batch(批处理)',
    en: 'Batch - /batch',
  },
  'supplier.model.form.spec.modeOption.ocr': {
    zh: 'OCR - /ocr(图文识别)',
    en: 'OCR - /ocr',
  },
  'supplier.model.form.spec.modeOption.custom': {
    zh: '自定义…',
    en: 'Custom…',
  },
  'supplier.model.form.spec.model': { zh: '选择模型', en: 'Model' },
  'supplier.model.form.spec.modelSelectPlaceholder': {
    zh: '从上游列表选择或手动输入',
    en: 'Pick from upstream list or type your own',
  },

  'supplier.model.form.defaultApiKeyTpmLimit': {
    zh: '默认 API Key TPM 限额',
    en: 'Default API Key TPM Limit',
  },
  'supplier.model.form.defaultApiKeyRpmLimit': {
    zh: '默认 API Key RPM 限额',
    en: 'Default API Key RPM Limit',
  },

  'supplier.model.form.limits.tpm': {
    zh: '每分钟 tokens(tpm)',
    en: 'Tokens per minute (tpm)',
  },
  'supplier.model.form.limits.rpm': {
    zh: '每分钟请求(rpm)',
    en: 'Requests per minute (rpm)',
  },
  'supplier.model.form.limits.maxBudget': {
    zh: '最大预算(maxBudget)',
    en: 'Maximum budget (maxBudget)',
  },
  'supplier.model.form.limits.budgetDuration': {
    zh: '预算周期(budgetDuration)',
    en: 'Budget duration (budgetDuration)',
  },

  'supplier.model.form.limits.custom': {
    zh: '设置限额',
    en: 'Set limits',
  },
  'supplier.model.form.cost.custom': {
    zh: '自定义价格',
    en: 'Custom pricing',
  },
  'supplier.model.form.cost.input': {
    zh: '输入单价(/1M token)',
    en: 'Input cost (per 1M tokens)',
  },
  'supplier.model.form.cost.output': {
    zh: '输出单价(/1M token)',
    en: 'Output cost (per 1M tokens)',
  },
  'supplier.model.form.cost.cacheRead': {
    zh: '缓存读取单价(/1M token)',
    en: 'Cache read cost (per 1M tokens)',
  },
  'supplier.model.form.cost.cacheWrite': {
    zh: '缓存写入单价(/1M token)',
    en: 'Cache creation cost (per 1M tokens)',
  },

  'supplier.model.form.flag.useInPassThrough': {
    zh: '透传模式',
    en: 'Pass-through',
  },
  'supplier.model.form.flag.useChatCompletionsApi': {
    zh: '使用 chat completions 接口',
    en: 'Use chat completions API',
  },
  'supplier.model.form.flag.mergeReasoningContentInChoices': {
    zh: '合并 reasoning 到 choices',
    en: 'Merge reasoning into choices',
  },

  'supplier.model.form.testFullHealthy': { zh: '连接正常', en: 'All healthy' },
  'supplier.model.form.testPartialOutage': { zh: '部分不可用', en: 'Partial outage' },
  'supplier.model.form.testFullOutage': { zh: '全部不可用', en: 'Full outage' },
  'supplier.model.form.testUnknown': { zh: '状态未知', en: 'Status unknown' },

  'supplier.model.form.unsavedDropWarning': {
    zh: '提交后未列出的 spec 将被删除',
    en: 'Specs not in the list will be deleted on submit',
  },

  // Metering center
  'metering.title': { zh: '计量中心仪表板', en: 'Metering Center Dashboard' },
  'metering.source.label': { zh: '数据源', en: 'Data source' },
  'metering.source.platform': { zh: '平台记录', en: 'Platform records' },
  'metering.source.gateway': { zh: '网关账（litellm）', en: 'Gateway ledger (litellm)' },
  'metering.spend.dimension': { zh: '维度', en: 'Dimension' },
  'metering.spend.dim.team': { zh: '按部门', en: 'By department' },
  'metering.spend.dim.model': { zh: '按模型', en: 'By model' },
  'metering.spend.dim.key': { zh: '按密钥', en: 'By key' },
  'metering.spend.from': { zh: '起', en: 'From' },
  'metering.spend.to': { zh: '止', en: 'To' },
  'metering.spend.export': { zh: '导出 CSV', en: 'Export CSV' },
  'metering.spend.export.empty': { zh: '当前无数据可导出', en: 'Nothing to export' },
  'metering.spend.partialFail': {
    zh: '网关 {names} 数据暂不可用，以下为其余网关的合计',
    en: 'Gateway {names} unavailable; showing the remaining gateways',
  },
  'metering.spend.loadFail': { zh: '加载花费数据失败', en: 'Failed to load spend data' },
  'metering.spend.loading': { zh: '加载中…', en: 'Loading…' },
  'metering.spend.noData': { zh: '该时间窗内无数据', en: 'No data in this window' },
  'metering.spend.totalCost': { zh: '总花费', en: 'Total cost' },
  'metering.spend.totalTokens': { zh: '总 Token', en: 'Total tokens' },
  'metering.spend.promptTokens': { zh: '输入 Token', en: 'Prompt tokens' },
  'metering.spend.completionTokens': { zh: '输出 Token', en: 'Completion tokens' },
  'metering.spend.trend': { zh: '花费趋势', en: 'Cost trend' },
  'metering.spend.topSpend': { zh: '花费排行 Top 5', en: 'Top 5 by spend' },
  'metering.spend.detail': { zh: '明细', en: 'Breakdown' },
  'metering.spend.col.label': { zh: '名称', en: 'Name' },
  'metering.spend.col.spend': { zh: '花费', en: 'Spend' },
  'metering.spend.col.total': { zh: '总 Token', en: 'Total tokens' },
  'metering.spend.col.prompt': { zh: '输入', en: 'Prompt' },
  'metering.spend.col.completion': { zh: '输出', en: 'Completion' },
  'metering.description': {
    zh: '按时间范围汇总网关调用量、Token 消耗与成本估算，支持按智能体与模型下钻。',
    en: 'Aggregated gateway call volume, token usage, and cost estimate over a time range, drill-down by agent and model.',
  },
  'metering.range.label': { zh: '时间范围', en: 'Time Range' },
  'metering.range.7d': { zh: '过去 7 天', en: 'Last 7 Days' },
  'metering.range.30d': { zh: '过去 30 天', en: 'Last 30 Days' },
  'metering.range.month': { zh: '本月', en: 'This Month' },
  'metering.range.custom': { zh: '自定义范围', en: 'Custom Range' },
  'metering.filter.agent': { zh: '智能体 ID', en: 'Agent ID' },
  'metering.filter.model': { zh: '模型', en: 'Model' },
  'metering.filter.allAgents': { zh: '全部智能体', en: 'All Agents' },
  'metering.filter.allModels': { zh: '全部模型', en: 'All Models' },
  'metering.chart.trend': {
    zh: 'Token 使用趋势（日/周/月）',
    en: 'Token Usage Trend (Day/Week/Month)',
  },
  'metering.chart.ranking': {
    zh: 'Token 使用排名（按智能体）',
    en: 'Token Usage Ranking (by Agent)',
  },
  'metering.token.input': { zh: '输入', en: 'Input' },
  'metering.token.output': { zh: '输出', en: 'Output' },
  'metering.table.agentTitle': { zh: '按智能体统计', en: 'Usage by Agent' },
  'metering.table.modelTitle': { zh: '按模型统计', en: 'Usage by Model' },
  'metering.table.dailyTitle': { zh: '按日期统计', en: 'Usage by Date' },
  'metering.table.agentId': { zh: '智能体 ID', en: 'Agent ID' },
  'metering.table.name': { zh: '名称', en: 'Name' },
  'metering.table.template': { zh: 'OVA 模板', en: 'OVA Template' },
  'metering.table.totalToken': { zh: '总 Token', en: 'Total Tokens' },
  'metering.table.requests': { zh: '请求次数', en: 'Requests' },
  'metering.table.status': { zh: '状态', en: 'Status' },
  'metering.table.date': { zh: '日期', en: 'Date' },
  'metering.table.showing': { zh: '显示中', en: 'Showing' },
  'metering.status.normal': { zh: '正常', en: 'Normal' },
  'metering.status.warning': { zh: '异常', en: 'Warning' },
  'metering.cost.title': { zh: '成本估算摘要', en: 'Cost Estimate Summary' },
  'metering.cost.total': { zh: '总计金额', en: 'Total Amount' },
  'metering.cost.monthly': { zh: '月份预计计算的成本', en: 'Estimated Monthly Cost' },
  'metering.cost.month': { zh: '月', en: 'month' },

  // 请求日志 (request logs)
  'requestLog.title': { zh: '请求日志记录', en: 'Request Log Records' },
  'requestLog.description': {
    zh: '查看经由网关代理的上游模型请求记录。',
    en: 'Browse upstream model requests proxied through the gateway.',
  },
  'requestLog.table.label': { zh: '请求日志列表', en: 'Request logs' },
  'requestLog.col.time': { zh: '时间', en: 'Time' },
  'requestLog.col.model': { zh: '模型', en: 'Model' },
  'requestLog.col.user': { zh: '用户', en: 'User' },
  'requestLog.filter.userPlaceholder': { zh: '用户 ID', en: 'User ID' },
  'requestLog.filter.from': { zh: '起', en: 'From' },
  'requestLog.filter.to': { zh: '止', en: 'To' },
  'requestLog.action.export': { zh: '导出 CSV', en: 'Export CSV' },
  'requestLog.export.empty': { zh: '当前无数据可导出', en: 'Nothing to export' },
  'requestLog.export.inProgress': { zh: '导出中…', en: 'Exporting…' },
  'requestLog.export.success': { zh: '已导出 {count} 条', en: 'Exported {count} rows' },
  'requestLog.export.fail': { zh: '导出失败', en: 'Export failed' },
  'requestLog.export.truncated': {
    zh: '数据较多，已导出前 {count} 条',
    en: 'Too many rows; exported the first {count}',
  },
  'requestLog.col.agent': { zh: '智能体', en: 'Agent' },
  'requestLog.col.agentId': { zh: '智能体 ID', en: 'Agent ID' },
  'requestLog.col.status': { zh: '状态', en: 'Status' },
  'requestLog.col.latency': { zh: '延迟', en: 'Latency' },
  'requestLog.col.latencyMs': { zh: '响应时间', en: 'Response Time' },
  'requestLog.col.tokens': { zh: 'Token (入/出)', en: 'Tokens (in/out)' },
  'requestLog.col.inputTokens': { zh: '输入 Token', en: 'Input Tokens' },
  'requestLog.col.outputTokens': { zh: '输出 Token', en: 'Output Tokens' },
  'requestLog.col.requestId': { zh: '请求 ID', en: 'Request ID' },
  'requestLog.col.detail': { zh: '详情', en: 'Detail' },
  'requestLog.col.actions': { zh: '操作', en: 'Actions' },
  'requestLog.value.latency': { zh: '{ms} ms', en: '{ms} ms' },
  'requestLog.value.tokensTitle': { zh: '输入 {in} / 输出 {out}', en: 'Input {in} / Output {out}' },
  'requestLog.action.refresh': { zh: '刷新', en: 'Refresh' },
  'requestLog.action.copy': { zh: '复制请求 ID', en: 'Copy request ID' },
  'requestLog.action.toggleDetail': { zh: '展开/收起详情', en: 'Toggle detail' },
  'requestLog.loading': { zh: '加载中…', en: 'Loading…' },
  'requestLog.empty': { zh: '暂无请求日志', en: 'No request logs' },
  'requestLog.filter.toolbar': { zh: '请求日志筛选工具栏', en: 'Request log filter toolbar' },
  'requestLog.filter.timeRange': { zh: '时间范围', en: 'Time range' },
  'requestLog.filter.last1h': { zh: '过去 1 小时', en: 'Last 1 hour' },
  'requestLog.filter.last6h': { zh: '过去 6 小时', en: 'Last 6 hours' },
  'requestLog.filter.customRange': { zh: '自定义范围', en: 'Custom range' },
  'requestLog.filter.status': { zh: '状态码', en: 'Status code' },
  'requestLog.filter.allStatus': { zh: '全部状态', en: 'All statuses' },
  'requestLog.filter.statusGroup': { zh: '状态码分组', en: 'Status code group' },
  'requestLog.filter.aria': { zh: '按{column}筛选', en: 'Filter by {column}' },
  'requestLog.filter.apply': { zh: '应用', en: 'Apply' },
  'requestLog.filter.clear': { zh: '清除', en: 'Clear' },
  'requestLog.filter.clearAll': { zh: '清除全部筛选', en: 'Clear all filters' },
  'requestLog.filter.activeHint': { zh: '已应用筛选', en: 'Filters applied' },
  'requestLog.filter.statusPlaceholder': { zh: '状态码，如 200', en: 'Status code, e.g. 200' },
  'requestLog.filter.statusInvalid': { zh: '请输入有效的状态码', en: 'Enter a valid status code' },
  'requestLog.filter.modelPlaceholder': { zh: '模型名称', en: 'Model name' },
  'requestLog.filter.agentPlaceholder': { zh: '智能体 ID', en: 'Agent ID' },
  'requestLog.filter.requestPlaceholder': { zh: '请求 ID', en: 'Request ID' },
  'requestLog.pagination.pageSize': { zh: '每页', en: 'Per page' },
  'requestLog.pagination.label': { zh: '分页', en: 'Pagination' },
  'requestLog.pagination.range': { zh: '第 {start}–{end} 条', en: 'Items {start}–{end}' },
  'requestLog.pagination.empty': { zh: '暂无数据', en: 'No data' },
  'requestLog.toast.refreshed': { zh: '已刷新', en: 'Refreshed' },
  'requestLog.toast.refreshFailed': { zh: '刷新失败', en: 'Refresh failed' },
  'requestLog.toast.loadFailed': { zh: '加载请求日志失败', en: 'Failed to load request logs' },
  'requestLog.toast.copied': { zh: '已复制请求 ID', en: 'Request ID copied' },
  'requestLog.toast.copyFailed': { zh: '复制失败', en: 'Copy failed' },

  // 审计日志 (audit logs)
  'auditLog.title': { zh: '审计日志记录', en: 'Audit Log Records' },
  'auditLog.description': {
    zh: '记录平台关键操作的审计轨迹，包含操作者、动作、资源与结果。',
    en: 'Audit trail of key platform operations: actor, action, resource and result.',
  },
  'auditLog.action.refresh': { zh: '刷新', en: 'Refresh' },
  'auditLog.action.toggleDetail': { zh: '查看详情', en: 'View detail' },
  'auditLog.action.copyResource': { zh: '复制资源 ID', en: 'Copy resource ID' },
  'auditLog.filter.category': { zh: '类别', en: 'Category' },
  'auditLog.filter.allCategories': { zh: '全部类别', en: 'All categories' },
  'auditLog.filter.toolbar': { zh: '审计日志筛选工具栏', en: 'Audit log filter toolbar' },
  'auditLog.filter.timeRange': { zh: '时间范围', en: 'Time range' },
  'auditLog.filter.last1d': { zh: '过去 1 天', en: 'Last 1 day' },
  'auditLog.filter.last7d': { zh: '过去 7 天', en: 'Last 7 days' },
  'auditLog.filter.customRange': { zh: '自定义范围', en: 'Custom range' },
  'auditLog.filter.from': { zh: '起', en: 'From' },
  'auditLog.filter.to': { zh: '止', en: 'To' },
  'auditLog.filter.result': { zh: '结果', en: 'Result' },
  'auditLog.filter.allResults': { zh: '全部结果', en: 'All results' },
  'auditLog.filter.resourceTypePlaceholder': { zh: '资源类型（如 user）', en: 'Resource type (e.g. user)' },
  'auditLog.action.export': { zh: '导出 CSV', en: 'Export CSV' },
  'auditLog.export.empty': { zh: '当前无数据可导出', en: 'Nothing to export' },
  'auditLog.export.inProgress': { zh: '导出中…', en: 'Exporting…' },
  'auditLog.export.success': { zh: '已导出 {count} 条', en: 'Exported {count} rows' },
  'auditLog.export.fail': { zh: '导出失败', en: 'Export failed' },
  'auditLog.export.truncated': {
    zh: '数据较多，已导出前 {count} 条',
    en: 'Too many rows; exported the first {count}',
  },
  'auditLog.filter.actionType': { zh: '操作类型', en: 'Action type' },
  'auditLog.filter.allActionTypes': { zh: '全部操作类型', en: 'All action types' },
  'auditLog.filter.activeHint': { zh: '已应用筛选', en: 'Filters applied' },
  'auditLog.filter.searchPlaceholder': { zh: '搜索操作描述', en: 'Search operation description' },
  'auditLog.filter.actorPlaceholder': { zh: '操作者用户 ID', en: 'Actor user ID' },
  'auditLog.filter.clear': { zh: '清除筛选', en: 'Clear filters' },
  'auditLog.col.time': { zh: '时间', en: 'Time' },
  'auditLog.col.actionTime': { zh: '操作时间', en: 'Action Time' },
  'auditLog.col.actor': { zh: '操作者', en: 'Actor' },
  'auditLog.col.action': { zh: '动作', en: 'Action' },
  'auditLog.col.actionType': { zh: '操作类型', en: 'Action Type' },
  'auditLog.col.resource': { zh: '资源', en: 'Resource' },
  'auditLog.col.resourceId': { zh: '资源 ID', en: 'Resource ID' },
  'auditLog.col.description': { zh: '操作描述', en: 'Description' },
  'auditLog.col.result': { zh: '结果', en: 'Result' },
  'auditLog.col.ip': { zh: 'IP 地址', en: 'IP' },
  'auditLog.col.detail': { zh: '详情', en: 'Detail' },
  'auditLog.result.success': { zh: '成功', en: 'Success' },
  'auditLog.result.fail': { zh: '失败', en: 'Failed' },
  'auditLog.value.system': { zh: '系统', en: 'System' },
  'auditLog.table.label': { zh: '审计日志列表', en: 'Audit log table' },
  'auditLog.loading': { zh: '加载中…', en: 'Loading…' },
  'auditLog.empty': { zh: '暂无审计记录', en: 'No audit records' },
  'auditLog.emptyFiltered': { zh: '没有匹配的审计记录', en: 'No audit records match your filters' },
  'auditLog.error.load': { zh: '加载审计日志失败', en: 'Failed to load audit logs' },
  'auditLog.toast.refreshed': { zh: '已刷新', en: 'Refreshed' },
  'auditLog.toast.refreshFailed': { zh: '刷新失败', en: 'Refresh failed' },
  'auditLog.toast.copied': { zh: '已复制资源 ID', en: 'Resource ID copied' },
  'auditLog.toast.copyFailed': { zh: '复制失败', en: 'Copy failed' },
  'auditLog.pagination.pageSize': { zh: '每页', en: 'Page size' },
  'auditLog.pagination.summary': {
    zh: '显示 {start}–{end} / {total}',
    en: 'Showing {start}–{end} of {total}',
  },
  'auditLog.pagination.empty': { zh: '暂无数据', en: 'No data' },
  'auditLog.pagination.label': { zh: '分页', en: 'Pagination' },
  'auditLog.pager.first': { zh: '首页', en: 'First page' },
  'auditLog.pager.prev': { zh: '上一页', en: 'Previous page' },
  'auditLog.pager.next': { zh: '下一页', en: 'Next page' },
  'auditLog.pager.last': { zh: '末页', en: 'Last page' },
  'auditLog.pager.page': { zh: '页码', en: 'Page' },
  'auditLog.category.user': { zh: '用户', en: 'User' },
  'auditLog.category.role': { zh: '角色', en: 'Role' },
  'auditLog.category.key': { zh: '令牌', en: 'Virtual Key' },
  'auditLog.category.rate_limit': { zh: '限流', en: 'Rate Limit' },
  'auditLog.category.model_gateway': { zh: '模型网关', en: 'Model Gateway' },
  'auditLog.category.gateway': { zh: '网关', en: 'Gateway' },
  'auditLog.category.model_route': { zh: '模型路由', en: 'Model Route' },
  'auditLog.category.router': { zh: '路由', en: 'Router' },
  'auditLog.category.agent': { zh: '智能体', en: 'Agent' },
  'auditLog.category.agent_config': { zh: '智能体配置', en: 'Agent Config' },
  'auditLog.category.resource_pool': { zh: '资源池', en: 'Resource Pool' },
  'auditLog.category.ova_template_family': { zh: 'OVA 模板族', en: 'OVA Template Family' },
  'auditLog.category.ova_template_version': { zh: 'OVA 模板版本', en: 'OVA Template Version' },

  // 实时监控 (real-time monitor)
  'monitor.title': { zh: '实时监控仪表板', en: 'Real-time Monitoring Dashboard' },
  'monitor.kpi.requests': { zh: '总请求数', en: 'Total requests' },
  'monitor.kpi.successRate': { zh: '成功率', en: 'Success rate' },
  'monitor.kpi.errors': { zh: '错误数', en: 'Errors' },
  'monitor.health.title': { zh: '上游健康（各网关）', en: 'Upstream health (per gateway)' },
  'monitor.health.unreachable': { zh: '网关不可达', en: 'Gateway unreachable' },
  'monitor.health.counts': { zh: '健康 {healthy} · 异常 {unhealthy}', en: '{healthy} healthy · {unhealthy} down' },
  'monitor.health.status.up': { zh: '健康', en: 'Healthy' },
  'monitor.health.status.partial': { zh: '部分异常', en: 'Partially degraded' },
  'monitor.health.status.down': { zh: '不可达', en: 'Unreachable' },
  'monitor.description': {
    zh: '按时间窗口聚合网关请求指标，实时刷新关键指标卡片与时序图表。',
    en: 'Aggregated gateway request metrics over a time window, with live-refreshing KPI cards and time-series charts.',
  },
  'monitor.window.label': { zh: '时间窗口', en: 'Time Window' },
  'monitor.window.1h': { zh: '过去 1 小时', en: 'Last 1 Hour' },
  'monitor.window.6h': { zh: '过去 6 小时', en: 'Last 6 Hours' },
  'monitor.window.24h': { zh: '过去 24 小时', en: 'Last 24 Hours' },
  'monitor.window.7d': { zh: '过去 7 天', en: 'Last 7 Days' },
  'monitor.window.custom': { zh: '自定义范围', en: 'Custom Range' },
  'monitor.range.start': { zh: '开始', en: 'Start' },
  'monitor.range.end': { zh: '结束', en: 'End' },
  'monitor.interval.label': { zh: '刷新间隔', en: 'Refresh Interval' },
  'monitor.interval.5s': { zh: '5 秒', en: '5s' },
  'monitor.interval.10s': { zh: '10 秒', en: '10s' },
  'monitor.interval.30s': { zh: '30 秒', en: '30s' },
  'monitor.interval.3m': { zh: '3 min', en: '3 min' },
  'monitor.interval.off': { zh: '关闭', en: 'Off' },
  'monitor.filter.label': { zh: '监控筛选', en: 'Monitor filters' },
  'monitor.filter.agentId': { zh: '智能体ID', en: 'Agent ID' },
  'monitor.filter.model': { zh: '模型', en: 'Model' },
  'monitor.kpi.totalRequests': { zh: '总请求数', en: 'Total Requests' },
  'monitor.kpi.errorRate': { zh: '错误率', en: 'Error Rate' },
  'monitor.kpi.avgLatency': { zh: '平均延迟', en: 'Avg Latency' },
  'monitor.kpi.p95Latency': { zh: 'P95 延迟', en: 'P95 Latency' },
  'monitor.kpi.inputTokens': { zh: '输入 Token', en: 'Input Tokens' },
  'monitor.kpi.outputTokens': { zh: '输出 Token', en: 'Output Tokens' },
  'monitor.chart.cpu': { zh: 'CPU 使用率 (%)', en: 'CPU Usage (%)' },
  'monitor.chart.memory': { zh: '内存使用率 (GB)', en: 'Memory Usage (GB)' },
  'monitor.chart.requestRate': {
    zh: '请求吞吐量 (Requests/sec)',
    en: 'Request Throughput (Requests/sec)',
  },
  'monitor.chart.avgLatency': { zh: '平均响应时间 (ms)', en: 'Average Response Time (ms)' },
  'monitor.chart.activeAgents': { zh: '活跃智能体数', en: 'Active Agents' },
  'monitor.chart.errorRequests': { zh: '错误请求数', en: 'Error Requests' },
  'monitor.chart.requests': { zh: '请求量', en: 'Request Volume' },
  'monitor.chart.errorRate': { zh: '错误率', en: 'Error Rate' },
  'monitor.chart.latency': { zh: '延迟（平均 / P95）', en: 'Latency (Avg / P95)' },
  'monitor.chart.tokens': { zh: 'Token（输入 / 输出）', en: 'Tokens (Input / Output)' },
  'monitor.series.input': { zh: 'Input/输入', en: 'Input' },
  'monitor.series.output': { zh: 'Output/输出', en: 'Output' },
  'monitor.series.requestRate': { zh: '请求吞吐量', en: 'Request Throughput' },
  'monitor.series.avgLatency': { zh: '平均响应时间', en: 'Avg Response Time' },
  'monitor.series.activeAgents': { zh: '活跃智能体数', en: 'Active Agents' },
  'monitor.series.errorRequests': { zh: '错误请求数', en: 'Error Requests' },
  'monitor.empty': { zh: '该时间窗口内暂无数据', en: 'No data in this time window' },
  'monitor.loading': { zh: '加载中…', en: 'Loading…' },
  'monitor.error.load': { zh: '加载监控指标失败', en: 'Failed to load monitor metrics' },
  'monitor.action.refresh': { zh: '刷新', en: 'Refresh' },
  'monitor.action.refreshWithInterval': { zh: '刷新 ({interval})', en: 'Refresh ({interval})' },
  'monitor.action.zoom': { zh: '放大图表', en: 'Zoom chart' },
  'monitor.action.closeZoom': { zh: '退出放大', en: 'Close zoom' },

  // agent-config (AgentConfigView + AgentConfigKnowledgeDialog)
  'agentConfig.title': { zh: '智能体配置', en: 'Agent Config' },
  'agentConfig.description': {
    zh: '管理智能体配置及其挂载的 OKF 知识包，知识包将在部署时注入智能体所在的虚拟机。',
    en: 'Manage agent configs and the OKF knowledge packs they mount; packs are injected into the agent VM at deploy.',
  },
  'agentConfig.action.refresh': { zh: '刷新', en: 'Refresh' },
  'agentConfig.action.batch': { zh: '批量操作', en: 'Bulk Actions' },
  'agentConfig.action.clearFilter': { zh: '清空筛选', en: 'Clear Filter' },
  'agentConfig.action.view': { zh: '查看', en: 'View' },
  'agentConfig.action.edit': { zh: '编辑', en: 'Edit' },
  'agentConfig.action.delete': { zh: '删除', en: 'Delete' },
  'agentConfig.action.create': { zh: '新建配置', en: 'New Config' },
  'agentConfig.action.createUnavailable': {
    zh: '新建配置功能即将上线',
    en: 'New config is coming soon',
  },
  'agentConfig.filter.agentType': { zh: '智能体类型', en: 'Agent Type' },
  'agentConfig.filter.allTypes': { zh: '全部类型', en: 'All types' },
  'agentConfig.table.label': { zh: '智能体配置列表', en: 'Agent config list' },
  'agentConfig.col.name': { zh: '配置名称', en: 'Config Name' },
  'agentConfig.col.agentType': { zh: '智能体类型', en: 'Agent Type' },
  'agentConfig.col.actions': { zh: '操作', en: 'Actions' },
  'agentConfig.col.name.search': { zh: '搜索配置名称', en: 'Search config name' },
  'agentConfig.sort': { zh: '排序：{column}', en: 'Sort {column}' },
  'agentConfig.filter': { zh: '过滤：{column}', en: 'Filter {column}' },
  'agentConfig.pagination.pageSize': { zh: '每页', en: 'Rows' },
  'agentConfig.pagination.page': { zh: '页码:', en: 'Page:' },
  'agentConfig.pagination.next': { zh: '下一页', en: 'Next' },
  'agentConfig.pager.first': { zh: '第一页', en: 'First page' },
  'agentConfig.pager.last': { zh: '最后一页', en: 'Last page' },
  'agentConfig.list.title': { zh: '配置列表', en: 'Configs' },
  'agentConfig.list.loading': { zh: '加载中…', en: 'Loading…' },
  'agentConfig.list.empty': { zh: '暂无智能体配置', en: 'No agent configs' },
  'agentConfig.list.error': { zh: '配置加载失败', en: 'Failed to load configs' },
  'agentConfig.badge.default': { zh: '默认', en: 'Default' },
  'agentConfig.detail.title': { zh: '配置详情', en: 'Config Details' },
  'agentConfig.detail.empty': {
    zh: '请选择左侧的一个配置以查看详情',
    en: 'Select a config to view details',
  },
  'agentConfig.detail.agentType': { zh: '智能体类型', en: 'Agent Type' },
  'agentConfig.detail.isDefault': { zh: '是否默认', en: 'Default' },
  'agentConfig.detail.createdAt': { zh: '创建时间', en: 'Created At' },
  'agentConfig.detail.artifactId': { zh: '制品 ID', en: 'Artifact ID' },
  'agentConfig.detail.yes': { zh: '是', en: 'Yes' },
  'agentConfig.detail.no': { zh: '否', en: 'No' },
  'agentConfig.detail.close': { zh: '关闭', en: 'Close' },
  'agentConfig.knowledge.sectionTitle': { zh: '已挂载知识包', en: 'Mounted Knowledge Packs' },
  'agentConfig.knowledge.edit': { zh: '编辑知识包', en: 'Edit Packs' },
  'agentConfig.knowledge.empty': { zh: '尚未挂载任何知识包', en: 'No knowledge packs mounted' },
  'agentConfig.knowledge.dialogTitle': {
    zh: '编辑挂载的知识包',
    en: 'Edit Mounted Knowledge Packs',
  },
  'agentConfig.knowledge.searchPlaceholder': { zh: '搜索知识包名称', en: 'Search knowledge packs' },
  'agentConfig.knowledge.loading': { zh: '正在加载知识包…', en: 'Loading knowledge packs…' },
  'agentConfig.knowledge.emptyArtifacts': {
    zh: '暂无可用知识包',
    en: 'No knowledge packs available',
  },
  'agentConfig.knowledge.selectedCount': {
    zh: '已选 {count} 个知识包',
    en: '{count} pack(s) selected',
  },
  'agentConfig.knowledge.cancel': { zh: '取消', en: 'Cancel' },
  'agentConfig.knowledge.save': { zh: '保存', en: 'Save' },
  'agentConfig.toast.saved': { zh: '已更新挂载的知识包', en: 'Mounted knowledge packs updated' },
  'agentConfig.toast.saveFailed': { zh: '保存知识包失败', en: 'Failed to update knowledge packs' },
  'agentConfig.toast.refreshed': { zh: '配置列表已刷新', en: 'Configs refreshed' },
  'agentConfig.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
  'agentConfig.toast.deleteUnavailable': {
    zh: '当前后端尚未提供删除智能体配置接口：{name}',
    en: 'The backend does not expose a delete operation for this config yet: {name}',
  },

  // agent-detail (AgentDetailView — /agents/:id)
  'agentDetail.title': { zh: '智能体详情', en: 'Agent Detail' },
  'agentDetail.backToList': { zh: '返回智能体列表', en: 'Back to Agent List' },
  'agentDetail.loading': { zh: '加载中…', en: 'Loading…' },
  'agentDetail.error': { zh: '加载失败，请稍后重试', en: 'Failed to load agent detail' },
  'agentDetail.notFound': { zh: '智能体不存在或无权访问', en: 'Agent not found or access denied' },
  'agentDetail.name': { zh: '名称', en: 'Name' },
  'agentDetail.type': { zh: '类型', en: 'Type' },
  'agentDetail.status': { zh: '状态', en: 'Status' },
  'agentDetail.endpoint': { zh: 'VM 端点', en: 'VM Endpoint' },
  'agentDetail.credentials': { zh: '运行账号', en: 'Run-as User' },
  'agentDetail.apiKey': { zh: '网关密钥', en: 'Gateway Key' },
  'agentDetail.template': { zh: '来源模板', en: 'Source Template' },
  'agentDetail.resourcePoolId': { zh: '资源池', en: 'Resource Pool' },
  'agentDetail.createdAt': { zh: '创建时间', en: 'Created At' },
  'agentDetail.updatedAt': { zh: '更新时间', en: 'Updated At' },

  /* ============================================================
   * Change Password (forced modal — see plan/spec)
   * Renders while `auth.mustChangePassword === true`.
   * ============================================================ */
  'changePassword.title': { zh: '修改密码', en: 'Change Password' },
  'changePassword.intro': {
    zh: '为了您的账户安全，请设置一个新的登录密码。',
    en: 'For your account security, please set a new password.',
  },
  'changePassword.current':       { zh: '当前密码',                     en: 'Current Password' },
  'changePassword.new':           { zh: '新密码',                       en: 'New Password' },
  'changePassword.confirm':       { zh: '确认新密码',                   en: 'Confirm New Password' },
  'changePassword.submit':        { zh: '提交',                         en: 'Submit' },
  'changePassword.submitUser':    { zh: '修改',                         en: 'Save' },
  'changePassword.mismatch':      {
    zh: '两次输入的新密码不一致',
    en: 'New passwords do not match.',
  },
  'changePassword.toast.ok':      { zh: '密码已更新',                   en: 'Password updated' },
  'changePassword.toast.fail':    { zh: '修改失败',                     en: 'Failed to update password' },
  'changePassword.error.required':{ zh: '请填写所有字段',               en: 'All fields are required.' },
  'changePassword.action.showPwd': { zh: '显示密码',                   en: 'Show password' },
  'changePassword.action.hidePwd': { zh: '隐藏密码',                   en: 'Hide password' },

  // Profile page (read-only identity + change password button)
  'profile.title':               { zh: '个人资料',                     en: 'Profile' },
  'profile.description':         { zh: '查看当前登录账户的基本信息与账号元数据。', en: 'View your current account identity and metadata.' },
  'profile.section.identity':    { zh: '账户身份',                     en: 'Identity' },
  'profile.section.metadata':    { zh: '账号元数据',                   en: 'Metadata' },
  'profile.field.username':      { zh: '用户名',                       en: 'Username' },
  'profile.field.displayName':   { zh: '显示名',                       en: 'Display Name' },
  'profile.field.email':         { zh: '邮箱',                         en: 'Email' },
  'profile.field.role':          { zh: '角色',                         en: 'Role' },
  'profile.field.createdAt':     { zh: '账户创建时间',                 en: 'Created At' },
  'profile.field.lastLogin':     { zh: '最后登录时间',                 en: 'Last Login' },
  'profile.field.status':        { zh: '连接状态',                     en: 'Connection Status' },
  'profile.field.mustChange':    { zh: '是否需要修改密码',             en: 'Forced Password Change' },
  'profile.status.online':       { zh: '在线',                         en: 'Online' },
  'profile.status.offline':      { zh: '离线',                         en: 'Offline' },
  'profile.mustChange.yes':      { zh: '是',                           en: 'Yes' },
  'profile.mustChange.no':       { zh: '否',                           en: 'No' },
  'profile.action.changePassword': { zh: '修改密码',                   en: 'Change Password' },
  'profile.unavailable':         { zh: '暂未提供',                     en: 'Not provided' },

  // --- Added for i18n/dark-mode fix pass ---
  'common.close': { zh: '关闭', en: 'Close' },
  'common.noPermission': { zh: '你没有权限执行此操作', en: 'You do not have permission to perform this action' },
  'common.time.justNow': { zh: '刚刚', en: 'Just now' },
  'common.time.minutesAgo': { zh: '{n} 分钟前', en: '{n} min ago' },
  'common.time.hoursAgo': { zh: '{n} 小时前', en: '{n} h ago' },
  'common.time.daysAgo': { zh: '{n} 天前', en: '{n} d ago' },
  'login.email.placeholder': { zh: 'you@example.com', en: 'you@example.com' },
  'login.password.placeholder': { zh: '您的密码', en: 'Your password' },
  'login.password.show': { zh: '显示密码', en: 'Show password' },
  'login.password.hide': { zh: '隐藏密码', en: 'Hide password' },
  'agents.aria.sort': { zh: '排序：{column}', en: 'Sort {column}' },
  'agents.aria.filter': { zh: '过滤：{column}', en: 'Filter {column}' },
  'marketplace.form.skillsPlaceholder': { zh: '一行一条', en: 'One per line' },
  'marketplace.form.error.type': { zh: '请选择类型', en: 'Type is required' },
  'marketplace.form.error.description': { zh: '请输入描述', en: 'Description is required' },
  'marketplace.form.error.tools': { zh: '请填写工具', en: 'Tools are required' },
  'marketplace.form.error.scenarios': { zh: '请填写场景', en: 'Scenarios are required' },
  'marketplace.form.error.skills': { zh: '请填写技能', en: 'Skills are required' },
  'marketplace.deploy.versionCount': { zh: '{n} 个版本可选', en: '{n} versions available' },
  'marketplace.card.latestVersionAria': { zh: '最新版本 {version}', en: 'Latest version {version}' },
  'auditLog.value.user': { zh: '用户 {id}', en: 'User {id}' },
  'monitor.series.cpu': { zh: 'CPU 使用率', en: 'CPU Usage' },
  'gateway.sort': { zh: '排序：{column}', en: 'Sort {column}' },
  'gateway.filter': { zh: '过滤：{column}', en: 'Filter {column}' },
  'resources.form.testConnectionFail': { zh: '请求失败，请重试', en: 'Request failed, please retry' },
  'resources.form.testDetail': { zh: 'vSphere {version} · {count} 个内容库', en: 'vSphere {version} · {count} content libraries' },
  'resources.form.endpointPlaceholder': { zh: 'https://vc.example.local/sdk', en: 'https://vc.example.local/sdk' },

  // Platform Settings (PlatformSettingsView) — agent OS user + agent-package mirror (LLD-16).
  'platformSettings.title': { zh: '平台设置', en: 'Platform Settings' },
  'platformSettings.description': {
    zh: '运维可编辑的平台级配置：智能体运行账户与智能体安装包镜像源。',
    en: 'Operator-editable platform config: the agent OS account and the agent-package mirror.',
  },
  'platformSettings.loadError': { zh: '加载平台设置失败', en: 'Failed to load platform settings' },
  'platformSettings.save': { zh: '保存', en: 'Save' },
  'platformSettings.saved': { zh: '平台设置已保存', en: 'Platform settings saved' },
  'platformSettings.saveFailed': { zh: '保存失败', en: 'Save failed' },
  'platformSettings.noChanges': { zh: '没有需要保存的改动', en: 'No changes to save' },

  'platformSettings.agent.title': { zh: '智能体运行账户', en: 'Agent OS User' },
  'platformSettings.agent.desc': {
    zh: '安装到虚拟机后，智能体以该操作系统账户运行（装机命令 su {{AGENT_USER}}）。未设置时默认为 agent。',
    en: 'Installed agents run on the VM as this OS account (install runs su {{AGENT_USER}}). Defaults to "agent" when unset.',
  },
  'platformSettings.agent.userLabel': { zh: '运行账户', en: 'OS user' },
  'platformSettings.agent.userPlaceholder': { zh: 'agent', en: 'agent' },
  'platformSettings.agent.userHint': {
    zh: '虚拟机上已存在的操作系统账户名，通常为 agent。',
    en: 'An OS account that already exists on the VM — usually "agent".',
  },
  'platformSettings.agent.userRequired': { zh: '请填写运行账户', en: 'OS user is required' },

  'platformSettings.pkg.title': { zh: '安装包镜像源', en: 'Package Mirror' },
  'platformSettings.pkg.desc': {
    zh: 'daemon 从该可信内部镜像拉取智能体安装包，用于首次开机安装与后续升级。密码写入后不回显。',
    en: 'The trusted internal mirror the daemon pulls agent packages from — for first-boot install and pull upgrades. The password is write-only and never shown.',
  },
  'platformSettings.pkg.urlLabel': { zh: '镜像地址', en: 'Mirror URL' },
  'platformSettings.pkg.urlPlaceholder': {
    zh: 'ftp://mirror.internal/agents',
    en: 'ftp://mirror.internal/agents',
  },
  'platformSettings.pkg.urlHint': {
    zh: '支持 ftp / http / https，需包含主机名；请勿在地址中内嵌账号密码，用下方字段填写。',
    en: 'ftp / http / https with a host. Do not embed credentials in the URL — use the fields below.',
  },
  'platformSettings.pkg.urlError': {
    zh: '地址无效：需为 ftp / http / https 且包含主机名',
    en: 'Invalid URL: must be ftp / http / https with a host',
  },
  'platformSettings.pkg.urlCredError': {
    zh: '请勿在地址中内嵌账号密码，请使用下方的用户名 / 密码字段',
    en: 'Do not embed credentials in the URL — use the username / password fields below',
  },
  'platformSettings.pkg.userLabel': { zh: '用户名', en: 'Username' },
  'platformSettings.pkg.userPlaceholder': { zh: '只读账户，可留空', en: 'Read-only account, optional' },
  'platformSettings.pkg.passwordLabel': { zh: '密码', en: 'Password' },
  'platformSettings.pkg.passwordPlaceholder': { zh: '●●●● 留空则不修改', en: '●●●● Leave blank to keep unchanged' },
  'platformSettings.pkg.passwordHint': {
    zh: '写入后不回显；留空表示沿用已保存的密码。',
    en: 'Write-only, never displayed. Leave blank to keep the stored password.',
  },
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
