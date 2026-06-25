import { describe, it, expect } from 'vitest'

import { STRINGS } from '@/stores/locale'
import { ARTIFACT_KINDS } from '@/api/graphql/queries/artifacts'
import { UPSTREAM_PROVIDERS, ROUTER_TIER_LEVELS } from '@/api/graphql/queries/gateway-routing'
import {
  GATEWAY_STATUSES,
  LOAD_BALANCE_STRATEGIES,
  GATEWAY_SYNC_STATES,
} from '@/api/graphql/queries/gateway-connections'

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
// The six `as const` arrays are imported from their query modules (the runtime
// source of truth). The four enums below are TypeScript *type unions* (no
// runtime array exists to import), so their members are mirrored here; if a
// union gains a member the dynamic `t()` call would render a raw key, which this
// test catches as a missing translation. Keep these in sync with the unions:
//   - InstallMethod         (queries/agent-templates.ts)
//   - AgentTemplateStatus   (queries/agent-templates.ts)
//   - MembershipRole        (queries/departments.ts)
//   - AgentLifecycleStatus  (queries/agent-snapshots.ts)
const INSTALL_METHODS = ['offline_tar', 'curl', 'unset'] as const
const AGENT_TEMPLATE_STATUSES = ['active', 'deferred'] as const
const MEMBERSHIP_ROLES = ['user', 'dept_admin'] as const
const AGENT_LIFECYCLE_STATUSES = ['provisioning', 'running', 'stopped', 'exception'] as const

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
