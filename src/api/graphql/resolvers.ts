/**
 * GraphQL resolvers — exposed as a `rootValue` consumed by `SchemaLink`.
 *
 * Conventions:
 * - Query/Mutation field resolvers live directly on this object.
 * - Nested object types (`UserConnection`, `AccountRoleRef`, `PageInfo`,
 *   `Role`, ...) do NOT need explicit resolvers — `buildSchema`'s default
 *   resolver pulls each field from the returned object by name.
 * - All mutations are side-effectful on the module-level fixture stores in
 *   `fixtures/*`. The next Query automatically sees the change because the
 *   stores are mutable arrays held in module scope.
 *
 * Auth/authz: not modeled. The 6 mutations are guarded by name + role
 * uniqueness / complexity rules only — see `UserRoleView` for client-side
 * permission UX.
 */
import {
  usersStore,
  usersFixture,
  createUserInFixture,
  updateUserInFixture,
  deleteUserFromFixture,
  resetUserPasswordInFixture,
  toggleEnabledInFixture,
  assignUsersToRoleInFixture,
  findUserByUsername,
  findUserByEmail,
  findUser,
} from './fixtures/users'
import { rolesFixture, findRoleOptional } from './fixtures/roles'
import { generatePassword, passwordMeets } from '../../composables/usePasswordComplexity'
import { agentsFixture, deployAgentInFixture } from './fixtures/agents'
import {
  resourcePoolsFixture,
  findResourcePool,
  createResourcePoolInFixture,
  updateResourcePoolInFixture,
  deleteResourcePoolFromFixture,
  syncResourcePoolInFixture,
} from './fixtures/resourcePools'
import {
  ovaTemplateFamiliesFixture,
  ovaTemplateVersionsFixture,
  findOvaTemplateFamily,
  findOvaTemplateFamilyByName,
  createOvaTemplateFamilyInFixture,
  addOvaTemplateVersionInFixture,
} from './fixtures/ovaTemplates'
import {
  virtualKeysFixture,
  findAvailableVirtualKeys,
  findVirtualKey,
  createVirtualKeyInFixture,
  revokeVirtualKeyInFixture,
} from './fixtures/virtualKeys'
import { GraphQLError } from 'graphql'
import type {
  AssignUsersToRoleInput,
  CreateOvaTemplateFamilyInput,
  AddOvaTemplateVersionInput,
  CreateVirtualKeyInput,
  CreateResourcePoolInput,
  CreateUserInput,
  DeployAgentInput,
  UpdateResourcePoolInput,
  UpdateUserInput,
} from './types'

/** Pretend SHA — used only so the fixture record has something opaque in
 *  `passwordHash`. Real hashing would happen at the backend, not here. */
function fakeHash(plaintext: string): string {
  // Don't roll our own crypto for real systems; this is a placeholder that
  // satisfies "we don't store plaintext" while staying zero-dependency.
  let h = 0
  for (let i = 0; i < plaintext.length; i++) {
    h = (h * 31 + plaintext.charCodeAt(i)) >>> 0
  }
  return `sha256$${h.toString(16).padStart(8, '0')}$${plaintext.length}`
}

/** All mutation timestamps share a single "now" for the lifetime of one
 *  resolver call so the `createdAt` and `updatedAt` are consistent. */
function nowIso(): string {
  return new Date().toISOString()
}

export const rootValue = {
  /* ============================================================
   * Query
   * ============================================================ */

  /* ============================================================
   * Resolver signatures — IMPORTANT
   *
   * The field-resolver call shape when using a `rootValue` with
   * `buildSchema` is:
   *
   *   rootValue[fieldName](args, contextValue, info)
   *
   * The `defaultFieldResolver` calls the function on the root with
   * (args, context, info) — NOT the conventional (source, args, ctx, info).
   * Source here is `rootValue` itself, which is unused. So our field
   * resolvers must take `args` as the FIRST parameter.
   *
   * Earlier these were written `(source, args) => ...`, which silently
   * dropped field arguments on the floor and made `sort`/`filter` look
   * like they were ignored. That was the bug behind "排序/过滤器不生效".
   * ============================================================ */

  agents: (args: {
    filter?: unknown
    pagination?: unknown
    sort?: unknown
  }) => agentsFixture(args as never),

  users: (args: {
    filter?: unknown
    pagination?: unknown
    sort?: unknown
  }) => usersFixture(args as never),

  roles: (_args: { pagination?: unknown }) => rolesFixture(),

  role: (args: { id: string }) => {
    const r = findRoleOptional(args.id)
    if (!r) return null
    // Re-compute userCount so it matches `rolesFixture` semantics.
    const count = usersStore.filter((u) => u.role.id === r.id).length
    return { ...r, userCount: count }
  },

  userExists: (
    args: { username?: string | null; email?: string | null },
  ) => {
    if (args.username && findUserByUsername(args.username)) return true
    if (args.email && findUserByEmail(args.email)) return true
    return false
  },

  // ---------- Resource Pool Access ----------
  resourcePools: (args: {
    filter?: unknown
    pagination?: unknown
    sort?: unknown
  }) => resourcePoolsFixture(args as never),

  resourcePool: (args: { id: string }) => {
    const p = findResourcePool(args.id)
    if (!p) throw new GraphQLError('资源池不存在', {
      extensions: { code: 'RESOURCE_POOL_NOT_FOUND' },
    })
    return p
  },

  // ---------- Agent Marketplace ----------
  ovaTemplateFamilies: (args: {
    filter?: unknown
    pagination?: unknown
    sort?: unknown
  }) => ovaTemplateFamiliesFixture(args as never),

  ovaTemplateFamily: (args: { id: string }) => {
    const f = findOvaTemplateFamily(args.id)
    if (!f) throw new GraphQLError('模板不存在', {
      extensions: { code: 'OVA_TEMPLATE_FAMILY_NOT_FOUND' },
    })
    return f
  },

  ovaTemplateVersions: (args: { familyId?: string; pagination?: unknown }) =>
    ovaTemplateVersionsFixture(args.familyId),

  virtualKeys: (args: { filter?: unknown; pagination?: unknown }) =>
    virtualKeysFixture(args.filter as never),

  availableVirtualKeys: (args: { modelGatewayId?: string }) =>
    findAvailableVirtualKeys(args.modelGatewayId),

  /* ============================================================
   * Mutation
   * ============================================================ */

  createUser: (args: { input: CreateUserInput }) => {
    const { input } = args
    const now = nowIso()

    if (findUserByUsername(input.username)) {
      throw new GraphQLError('用户名已存在', {
        extensions: { code: 'USERNAME_TAKEN', field: 'username' },
      })
    }
    if (findUserByEmail(input.email)) {
      throw new GraphQLError('邮箱已被使用', {
        extensions: { code: 'EMAIL_TAKEN', field: 'email' },
      })
    }

    let generatedPassword: string | null = null
    let passwordHash: string
    if (input.passwordMode === 'AUTO') {
      generatedPassword = generatePassword(16)
      passwordHash = fakeHash(generatedPassword)
    } else {
      const pwd = input.customPassword ?? ''
      const check = passwordMeets(pwd)
      if (!check.ok) {
        throw new GraphQLError('密码不满足复杂度要求', {
          extensions: { code: 'PASSWORD_WEAK', reasons: check.reasons },
        })
      }
      generatedPassword = null
      passwordHash = fakeHash(pwd)
    }

    const user = createUserInFixture({
      username: input.username,
      displayName: input.displayName ?? '',
      email: input.email,
      roleId: input.roleId,
      passwordHash,
      enabled: input.enabled ?? true,
      now,
    })
    return { user, generatedPassword }
  },

  updateUser: (
    args: { id: string; input: UpdateUserInput },
  ) => {
    const { id, input } = args
    if (input.email && findUserByEmail(input.email) && findUser(id).email !== input.email) {
      throw new GraphQLError('邮箱已被使用', {
        extensions: { code: 'EMAIL_TAKEN', field: 'email' },
      })
    }
    return updateUserInFixture(id, input, nowIso())
  },

  deleteUser: (args: { id: string }) => {
    deleteUserFromFixture(args.id)
    return { id: args.id }
  },

  resetUserPassword: (args: { id: string }) => {
    const now = nowIso()
    const newPassword = generatePassword(16)
    const user = resetUserPasswordInFixture(args.id, fakeHash(newPassword), now)
    return { user, generatedPassword: newPassword }
  },

  toggleUserEnabled: (args: { id: string }) => {
    const user = toggleEnabledInFixture(args.id, nowIso())
    return { user }
  },

  assignUsersToRole: (
    args: { input: AssignUsersToRoleInput },
  ) => {
    const { roleId, userIds } = args.input
    const { assignedCount } = assignUsersToRoleInFixture(roleId, userIds, nowIso())
    const role = findRoleOptional(roleId)
    if (!role) throw new GraphQLError('角色不存在', { extensions: { code: 'ROLE_NOT_FOUND' } })
    const count = usersStore.filter((u) => u.role.id === roleId).length
    return { role: { ...role, userCount: count }, assignedCount }
  },

  // ---------- Resource Pool Access mutations ----------
  createResourcePool: (args: { input: CreateResourcePoolInput }) => {
    const name = args.input?.name?.trim()
    const endpoint = args.input?.endpoint?.trim()
    const contentLibraryName = args.input?.contentLibraryName?.trim()
    if (!name) {
      throw new GraphQLError('资源池名称不能为空', {
        extensions: { code: 'NAME_REQUIRED', field: 'name' },
      })
    }
    if (!endpoint) {
      throw new GraphQLError('Endpoint 不能为空', {
        extensions: { code: 'ENDPOINT_REQUIRED', field: 'endpoint' },
      })
    }
    if (!contentLibraryName) {
      throw new GraphQLError('内容库名称不能为空', {
        extensions: { code: 'CONTENT_LIBRARY_NAME_REQUIRED', field: 'contentLibraryName' },
      })
    }
    const pool = createResourcePoolInFixture(args.input, nowIso())
    return { pool }
  },

  updateResourcePool: (args: { id: string; input: UpdateResourcePoolInput }) => {
    try {
      const pool = updateResourcePoolInFixture(args.id, args.input, nowIso())
      return { pool }
    } catch (err) {
      throw new GraphQLError((err as Error).message, {
        extensions: { code: 'RESOURCE_POOL_NOT_FOUND' },
      })
    }
  },

  deleteResourcePool: (args: { id: string }) => {
    try {
      return deleteResourcePoolFromFixture(args.id)
    } catch (err) {
      throw new GraphQLError((err as Error).message, {
        extensions: { code: 'RESOURCE_POOL_NOT_FOUND' },
      })
    }
  },

  syncResourcePool: (args: { id: string }) => {
    try {
      return syncResourcePoolInFixture(args.id, nowIso())
    } catch (err) {
      throw new GraphQLError((err as Error).message, {
        extensions: { code: 'RESOURCE_POOL_NOT_FOUND' },
      })
    }
  },

  // Pretend test-connection: returns 50% success / 50% failure with a
  // stable hash so the same name+endpoint+contentLibraryName triple
  // always yields the same result (good for screenshot tests / dev).
  testResourcePoolConnection: (args: {
    input: {
      name?: string | null
      endpoint?: string | null
      contentLibraryName?: string | null
    }
  }) => {
    const name = (args.input?.name ?? '').trim()
    const endpoint = (args.input?.endpoint ?? '').trim()
    const contentLibraryName = (args.input?.contentLibraryName ?? '').trim()
    if (!name || !endpoint || !contentLibraryName) {
      return { ok: false, message: '字段不能为空', detail: null }
    }
    const seed = `${name}|${endpoint}|${contentLibraryName}`
    let h = 0
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0
    }
    if (h % 2 === 0) {
      return {
        ok: true,
        message: '连接成功',
        detail: { vSphereVersion: '7.0.3', itemCount: 12 },
      }
    }
    const failureMessages = ['Endpoint 不可达', '内容库未找到', '认证失败']
    return { ok: false, message: failureMessages[h % failureMessages.length], detail: null }
  },

  // ---------- Agent Marketplace ----------
  createOvaTemplateFamily: (args: { input: CreateOvaTemplateFamilyInput }) => {
    if (!args.input.name?.trim()) {
      throw new GraphQLError('名称不能为空', {
        extensions: { code: 'NAME_REQUIRED', field: 'name' },
      })
    }
    if (!args.input.initialVersion?.ovaIdentifier?.trim()) {
      throw new GraphQLError('OVA 标识符不能为空', {
        extensions: { code: 'OVA_IDENTIFIER_REQUIRED' },
      })
    }
    if (findOvaTemplateFamilyByName(args.input.name.trim())) {
      throw new GraphQLError('名称已存在', { extensions: { code: 'OVA_NAME_TAKEN' } })
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(args.input.initialVersion.ovaIdentifier.trim())) {
      throw new GraphQLError('OVA 标识符格式不正确', {
        extensions: { code: 'OVA_IDENTIFIER_FORMAT' },
      })
    }
    return { family: createOvaTemplateFamilyInFixture(args.input, nowIso()) }
  },

  addOvaTemplateVersion: (args: { input: AddOvaTemplateVersionInput }) => {
    try {
      return { version: addOvaTemplateVersionInFixture(args.input, nowIso()) }
    } catch (err) {
      throw new GraphQLError((err as Error).message, {
        extensions: { code: 'OVA_TEMPLATE_FAMILY_NOT_FOUND' },
      })
    }
  },

  // ---------- VirtualKey ----------
  createVirtualKey: (args: { input: CreateVirtualKeyInput }) => {
    if (!args.input.name?.trim()) {
      throw new GraphQLError('密钥名称不能为空', {
        extensions: { code: 'NAME_REQUIRED' },
      })
    }
    return createVirtualKeyInFixture(args.input, nowIso())
  },

  revokeVirtualKey: (args: { id: string }) => {
    try {
      return revokeVirtualKeyInFixture(args.id, nowIso())
    } catch (err) {
      throw new GraphQLError((err as Error).message, {
        extensions: { code: 'VIRTUAL_KEY_NOT_FOUND' },
      })
    }
  },

  // ---------- Deploy Agent ----------
  deployAgent: (args: { input: DeployAgentInput }) => {
    if (!args.input.name?.trim()) {
      throw new GraphQLError('智能体名称不能为空', {
        extensions: { code: 'NAME_REQUIRED' },
      })
    }
    if (!args.input.username?.trim()) {
      throw new GraphQLError('运行账户用户名不能为空', {
        extensions: { code: 'USERNAME_REQUIRED' },
      })
    }
    if (!args.input.password) {
      throw new GraphQLError('密码不能为空', {
        extensions: { code: 'PASSWORD_REQUIRED' },
      })
    }
    if (args.input.virtualKeyMode === 'USE_EXISTING' && !args.input.existingVirtualKeyId) {
      throw new GraphQLError('缺少已选虚拟密钥 ID', {
        extensions: { code: 'VIRTUAL_KEY_REQUIRED' },
      })
    }
    if (args.input.virtualKeyMode === 'CREATE_NEW' && !args.input.newVirtualKeyName?.trim()) {
      throw new GraphQLError('新虚拟密钥名称不能为空', {
        extensions: { code: 'VIRTUAL_KEY_NAME_REQUIRED' },
      })
    }
    try {
      return deployAgentInFixture(args.input, nowIso())
    } catch (err) {
      throw new GraphQLError((err as Error).message, {
        extensions: { code: 'DEPLOY_FAILED' },
      })
    }
  },
}