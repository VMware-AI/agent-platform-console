import { describe, it, expect } from 'vitest'

import { STRINGS } from '@/stores/locale'
import { ARTIFACT_KINDS } from '@/api/graphql/queries/artifacts'
import { UPSTREAM_PROVIDERS, ROUTER_TIER_LEVELS } from '@/api/graphql/queries/gateway-routing'
import {
  GATEWAY_STATUSES,
  LOAD_BALANCE_STRATEGIES,
  GATEWAY_SYNC_STATES,
} from '@/api/graphql/queries/gateway-connections'
import { INSTALL_METHODS, AGENT_TEMPLATE_STATUSES } from '@/api/graphql/queries/agent-templates'
import { MEMBERSHIP_ROLES } from '@/api/graphql/queries/departments'
import { AGENT_LIFECYCLE_STATUSES } from '@/api/graphql/queries/agent-snapshots'

// ENUM → LOCALE-KEY COVERAGE.
//
// Views render enum members through DYNAMIC keys, e.g.
//   t(`gatewayConn.status.${connection.status}`)
//   t(`artifacts.kind.${kind}`)
// which the static i18n-completeness scan cannot resolve. This test closes that
// gap: for every enum member that can appear at runtime, assert the matching
// `${prefix}.${member}` key exists in STRINGS, so adding an enum value without
// its translation fails CI.
//
// Every `as const` array below is imported from its query module (the runtime
// source of truth); the corresponding TS union types are derived from these
// arrays, so a union gaining a member adds it here automatically and this test
// catches the missing translation.

interface EnumCase {
  readonly name: string
  readonly prefix: string
  readonly members: readonly string[]
}

const ENUM_CASES: readonly EnumCase[] = [
  { name: 'ARTIFACT_KINDS', prefix: 'artifacts.kind', members: ARTIFACT_KINDS },
  { name: 'UPSTREAM_PROVIDERS', prefix: 'upstreamRouter.provider', members: UPSTREAM_PROVIDERS },
  { name: 'ROUTER_TIER_LEVELS', prefix: 'upstreamRouter.tierLevel', members: ROUTER_TIER_LEVELS },
  { name: 'GATEWAY_STATUSES', prefix: 'gatewayConn.status', members: GATEWAY_STATUSES },
  { name: 'LOAD_BALANCE_STRATEGIES', prefix: 'gatewayConn.strategy', members: LOAD_BALANCE_STRATEGIES },
  { name: 'GATEWAY_SYNC_STATES', prefix: 'gatewayConn.syncState', members: GATEWAY_SYNC_STATES },
  { name: 'InstallMethod', prefix: 'agentTemplate.installMethod', members: INSTALL_METHODS },
  { name: 'AgentTemplateStatus', prefix: 'agentTemplate.status', members: AGENT_TEMPLATE_STATUSES },
  { name: 'MembershipRole', prefix: 'department.role', members: MEMBERSHIP_ROLES },
  { name: 'AgentLifecycleStatus', prefix: 'agentSnapshot.status', members: AGENT_LIFECYCLE_STATUSES },
]

describe('enum → locale-key coverage', () => {
  it.each(ENUM_CASES)('$name: every member has $prefix.<member> in STRINGS', ({ members, prefix }) => {
    expect(members.length).toBeGreaterThan(0)
    const missing = members
      .map((member) => `${prefix}.${member}`)
      .filter((key) => !(key in STRINGS))
    expect(missing, `Missing enum locale keys:\n${missing.join('\n')}`).toEqual([])
  })

  it('every imported enum is a non-empty array (guards against bad imports)', () => {
    for (const { name, members } of ENUM_CASES) {
      expect(Array.isArray(members), `${name} should be an array`).toBe(true)
      expect(members.length, `${name} should not be empty`).toBeGreaterThan(0)
    }
  })
})
