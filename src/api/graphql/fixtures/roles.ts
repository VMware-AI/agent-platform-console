import type { Role, RoleConnection, RolesQueryVars } from '../types'
import { usersStore } from './users'

/**
 * 3 predefined roles — fixed set per product spec.
 *
 * - `super-admin`     超级管理员
 * - `agent-admin`     智能体管理员
 * - `guest-user`      访客用户
 *
 * All three are `builtIn: true` so the row-level "删除角色" button is
 * always disabled (matches the design — these roles can't be removed).
 */
export const ROLES: Role[] = [
  {
    id: 'super-admin',
    name: '超级管理员',
    description: '拥有平台所有功能的完整权限',
    userCount: 0, // recomputed below at module load
    builtIn: true,
  },
  {
    id: 'agent-admin',
    name: '智能体管理员',
    description: '可管理平台所有智能体及其相关配置',
    userCount: 0,
    builtIn: true,
  },
  {
    id: 'guest-user',
    name: '访客用户',
    description: '只读浏览公开信息,无任何修改权限',
    userCount: 0,
    builtIn: true,
  },
]

/** Re-compute `userCount` for every role from the live user store.
 *  Called on every read so a `createUser` / `assignUsersToRole` mutation
 *  is immediately reflected in the next `roles` query without a manual
 *  cache bust. */
function withUserCounts(): Role[] {
  const counts = new Map<string, number>()
  for (const u of usersStore) {
    counts.set(u.role.id, (counts.get(u.role.id) ?? 0) + 1)
  }
  return ROLES.map((r) => ({ ...r, userCount: counts.get(r.id) ?? 0 }))
}

export function rolesFixture(_vars: RolesQueryVars | null | undefined = {}): RoleConnection {
  const nodes = withUserCounts()
  return {
    nodes,
    totalCount: nodes.length,
    pageInfo: { page: 1, pageSize: nodes.length, totalPages: 1 },
  }
}

/** Read used by `RoleUsersDialog` to fetch every user under one role. */
export function findUsersByRoleId(roleId: string) {
  return usersStore.filter((u) => u.role.id === roleId)
}

export function findRoleOptional(id: string): Role | undefined {
  return ROLES.find((r) => r.id === id)
}