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
import { agentsFixture } from './fixtures/agents'
import {
  resourcePoolsFixture,
  findResourcePool,
  createResourcePoolInFixture,
  updateResourcePoolInFixture,
  deleteResourcePoolFromFixture,
  syncResourcePoolInFixture,
} from './fixtures/resourcePools'
import { GraphQLError } from 'graphql'
import type {
  AssignUsersToRoleInput,
  CreateResourcePoolInput,
  CreateUserInput,
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
      displayName: input.displayName,
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
}