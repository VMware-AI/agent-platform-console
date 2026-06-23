import type {
  AccountUser,
  Pagination,
  UserConnection,
  UserFilter,
  UserSort,
  UserSortField,
  UsersQueryVars,
} from '../types'
import { ROLES } from './roles'

/**
 * Module-level mutable user store. Resolvers write to it so the next query
 * reflects the change. This is a deliberate fixture-side effect — the schema
 * is executed by `SchemaLink` so all mutations go through `resolvers.ts` and
 * land here.
 *
 * 6 records spread across the 3 predefined roles. Password hashes are
 * placeholders — only `generatedPassword` ever crosses the wire as plaintext.
 */
export const usersStore: AccountUser[] = [
  {
    id: 'u1',
    username: 'admin',
    displayName: '系统管理员',
    email: 'admin@platform.com',
    role: { id: 'super-admin', name: '超级管理员' },
    connectionStatus: 'ONLINE',
    lastLoginAt: '2026-06-21T08:30:00Z',
    enabled: true,
    createdAt: '2026-01-15T02:00:00Z',
    updatedAt: '2026-06-21T08:30:00Z',
    passwordHash: 'sha256$placeholder',
  },
  {
    id: 'u2',
    username: 'agent_admin',
    displayName: '智能体管理员',
    email: 'agent.admin@platform.com',
    role: { id: 'agent-admin', name: '智能体管理员' },
    connectionStatus: 'ONLINE',
    lastLoginAt: '2026-06-20T14:12:00Z',
    enabled: true,
    createdAt: '2026-02-03T03:00:00Z',
    updatedAt: '2026-06-20T14:12:00Z',
    passwordHash: 'sha256$placeholder',
  },
  {
    id: 'u3',
    username: 'dev_user',
    displayName: '开发者A',
    email: 'dev.user@platform.com',
    role: { id: 'agent-admin', name: '智能体管理员' },
    connectionStatus: 'OFFLINE',
    lastLoginAt: '2026-06-10T09:00:00Z',
    enabled: true,
    createdAt: '2026-03-12T05:00:00Z',
    updatedAt: '2026-06-10T09:00:00Z',
    passwordHash: 'sha256$placeholder',
  },
  {
    id: 'u4',
    username: 'guest_01',
    displayName: '访客用户1',
    email: 'guest1@platform.com',
    role: { id: 'guest-user', name: '访客用户' },
    connectionStatus: 'OFFLINE',
    lastLoginAt: null,
    enabled: false,
    createdAt: '2026-04-22T07:00:00Z',
    updatedAt: '2026-05-01T02:00:00Z',
    passwordHash: 'sha256$placeholder',
  },
  {
    id: 'u5',
    username: 'guest_02',
    displayName: '访客用户2',
    email: 'guest2@platform.com',
    role: { id: 'guest-user', name: '访客用户' },
    connectionStatus: 'ONLINE',
    lastLoginAt: '2026-06-18T11:45:00Z',
    enabled: true,
    createdAt: '2026-04-30T07:00:00Z',
    updatedAt: '2026-06-18T11:45:00Z',
    passwordHash: 'sha256$placeholder',
  },
  {
    id: 'u6',
    username: 'observer',
    displayName: '观察员',
    email: 'observer@platform.com',
    role: { id: 'guest-user', name: '访客用户' },
    connectionStatus: 'OFFLINE',
    lastLoginAt: '2026-05-29T16:20:00Z',
    enabled: true,
    createdAt: '2026-05-15T04:00:00Z',
    updatedAt: '2026-05-29T16:20:00Z',
    passwordHash: 'sha256$placeholder',
  },
]

/* ---------- Pure helpers (consumed by resolvers) ---------- */

export function applyUserFilter(users: AccountUser[], filter: UserFilter | null | undefined): AccountUser[] {
  if (!filter) return users
  let out = users
  if (filter.usernameKeyword) {
    const kw = filter.usernameKeyword.toLowerCase()
    out = out.filter((u) => u.username.toLowerCase().includes(kw))
  }
  if (filter.emailKeyword) {
    const kw = filter.emailKeyword.toLowerCase()
    out = out.filter((u) => u.email.toLowerCase().includes(kw))
  }
  if (filter.roleKeyword) {
    const kw = filter.roleKeyword.toLowerCase()
    out = out.filter((u) => u.role.name.toLowerCase().includes(kw))
  }
  if (filter.roleId) {
    out = out.filter((u) => u.role.id === filter.roleId)
  }
  if (filter.statusKeyword) {
    out = out.filter((u) => u.connectionStatus === filter.statusKeyword)
  }
  return out
}

function compareBy(field: UserSortField, a: AccountUser, b: AccountUser): number {
  switch (field) {
    case 'USERNAME':
      return a.username.localeCompare(b.username)
    case 'ROLE':
      return a.role.name.localeCompare(b.role.name)
    case 'EMAIL':
      return a.email.localeCompare(b.email)
    case 'CONNECTION':
      return a.connectionStatus.localeCompare(b.connectionStatus)
    case 'LAST_LOGIN':
      return (a.lastLoginAt ?? '').localeCompare(b.lastLoginAt ?? '')
    case 'CREATED_AT':
      return a.createdAt.localeCompare(b.createdAt)
    case 'UPDATED_AT':
      return a.updatedAt.localeCompare(b.updatedAt)
    default:
      return 0
  }
}

export function applyUserSort(users: AccountUser[], sort: UserSort | null | undefined): AccountUser[] {
  if (!sort) return users
  const dir = sort.direction === 'DESC' ? -1 : 1
  return [...users].sort((a, b) => dir * compareBy(sort.field, a, b))
}

export function paginateUsers(users: AccountUser[], pagination: Pagination | null | undefined): UserConnection {
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? (users.length || 1)
  const totalCount = users.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const start = (page - 1) * pageSize
  const nodes = users.slice(start, start + pageSize)
  return {
    nodes,
    totalCount,
    pageInfo: { page, pageSize, totalPages },
  }
}

/** Query-shaped helper — used by both Query.users resolver and by the
 *  front-end dedupe check (which queries with a single keyword). */
export function usersFixture(vars: UsersQueryVars | null | undefined = {}): UserConnection {
  const v = vars ?? {}
  const filtered = applyUserFilter(usersStore, v.filter)
  const sorted = applyUserSort(filtered, v.sort)
  return paginateUsers(sorted, v.pagination)
}

/** Lookup used by every user-scoped mutation. Throws if not found. */
export function findUser(id: string): AccountUser {
  const u = usersStore.find((x) => x.id === id)
  if (!u) throw new Error(`用户不存在: ${id}`)
  return u
}

/** Read-only lookup (used by queries that should not throw on missing). */
export function findUserOptional(id: string): AccountUser | undefined {
  return usersStore.find((x) => x.id === id)
}

/* ---------- Mutation helpers (side-effect on `usersStore`) ---------- */

export function createUserInFixture(args: {
  username: string
  displayName: string
  email: string
  roleId: string
  passwordHash: string
  enabled: boolean
  now: string
}): AccountUser {
  const role = ROLES.find((r) => r.id === args.roleId)
  if (!role) throw new Error(`角色不存在: ${args.roleId}`)
  const newUser: AccountUser = {
    id: `u${Date.now()}`,
    username: args.username,
    displayName: args.displayName,
    email: args.email,
    role: { id: role.id, name: role.name },
    connectionStatus: 'OFFLINE',
    lastLoginAt: null,
    enabled: args.enabled,
    createdAt: args.now,
    updatedAt: args.now,
    passwordHash: args.passwordHash,
  }
  usersStore.push(newUser)
  return newUser
}

export function updateUserInFixture(
  id: string,
  patch: {
    displayName?: string | null
    email?: string | null
    roleId?: string | null
    enabled?: boolean | null
  },
  now: string,
): AccountUser {
  const u = findUser(id)
  if (patch.displayName !== undefined && patch.displayName !== null) u.displayName = patch.displayName
  if (patch.email !== undefined && patch.email !== null) u.email = patch.email
  if (patch.roleId !== undefined && patch.roleId !== null) {
    const role = ROLES.find((r) => r.id === patch.roleId)
    if (!role) throw new Error(`角色不存在: ${patch.roleId}`)
    u.role = { id: role.id, name: role.name }
  }
  if (patch.enabled !== undefined && patch.enabled !== null) u.enabled = patch.enabled
  u.updatedAt = now
  return u
}

export function deleteUserFromFixture(id: string): void {
  const i = usersStore.findIndex((x) => x.id === id)
  if (i === -1) throw new Error(`用户不存在: ${id}`)
  usersStore.splice(i, 1)
}

export function resetUserPasswordInFixture(
  id: string,
  passwordHash: string,
  now: string,
): AccountUser {
  const u = findUser(id)
  u.passwordHash = passwordHash
  u.updatedAt = now
  return u
}

export function toggleEnabledInFixture(id: string, now: string): AccountUser {
  const u = findUser(id)
  u.enabled = !u.enabled
  u.updatedAt = now
  return u
}

export function assignUsersToRoleInFixture(roleId: string, userIds: string[], now: string): {
  roleId: string
  assignedCount: number
} {
  const role = ROLES.find((r) => r.id === roleId)
  if (!role) throw new Error(`角色不存在: ${roleId}`)
  let count = 0
  for (const id of userIds) {
    const u = findUserOptional(id)
    if (!u) continue
    u.role = { id: role.id, name: role.name }
    u.updatedAt = now
    count++
  }
  return { roleId, assignedCount: count }
}

/** Used by the front-end dedupe check (debounce 300 ms) and by the
 *  authoritative `createUser` resolver. */
export function findUserByUsername(username: string): AccountUser | undefined {
  return usersStore.find((u) => u.username.toLowerCase() === username.toLowerCase())
}

export function findUserByEmail(email: string): AccountUser | undefined {
  return usersStore.find((u) => u.email.toLowerCase() === email.toLowerCase())
}