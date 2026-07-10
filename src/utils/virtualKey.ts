import type { IssueVirtualKeyInputVars } from '@/api/graphql/queries/virtual-keys'

// CloneVirtualKeyInput — mirror of IssueVirtualKeyInputVars that the form
// modal reads on the clone path. Differs from IssueVirtualKeyInputVars
// only in that `name` is intentionally cleared at the helper boundary
// (the modal forces the user to retype a non-empty name to avoid two
// keys sharing a label) and `duration` is dropped entirely (cloned keys
// must pick a fresh lifetime — inheriting the source's *remaining*
// lifetime would be meaningless, since `VirtualKey.duration` is a
// remaining-time projection computed from expiresAt, not a total).
//
// `userId` is left null here so the parent's `submitKey()` can keep
// hard-coding the dev-console placeholder `'admin'` (see TODO at
// VirtualKeyView.vue's submitKey for the eventual auth-store swap).
export interface CloneVirtualKeyInput
  extends Omit<IssueVirtualKeyInputVars, 'name' | 'duration' | 'agentId'> {
  name: string
  // Clone deliberately does NOT carry `agentId` from the source —
  // IssueVirtualKeyInput has no agentId field on the backend schema
  // (binding is via the separate `associateVirtualKeyAgent` mutation).
  // The field stays in the GraphQL type for backward compatibility
  // with the create flow; clone just sets it null.
}

// CloneableVirtualKeyFields — the *minimum* shape of a VirtualKey the
// helper actually consumes. Fields that the clone path can't honour
// (name / status / expiresAt / agent) are not listed. Using a `Pick<>`
// constraint here keeps the helper honest: callers can't sneak
// `expiresAt` or `lastActiveAt` through it. If the source's
// VirtualKeyFields fragment ever grows a new clone-relevant field, add
// it here and the type checker will force the helper to handle it.
export interface CloneableVirtualKeyFields {
  modelGateway: { id: string } | null
  models: string[]
  // The list-side `VirtualKeyFields` fragment trims to the columns the
  // page actually displays (maskedKey / status / agent / modelGateway /
  // models / expiresAt / createdAt / updatedAt / lastActiveAt / spend /
  // maxBudget — see api/graphql/queries/virtual-keys.ts). Clone-relevant
  // governance fields (rpmLimit / tpmLimit / keyType / metadata / ...) are
  // NOT on the list fragment because the page doesn't render them, so the
  // helper sees `undefined` for those. The form modal's prefill block
  // already tolerates `undefined` per-field (each `if (typeof ... === 'number')`
  // branch is guarded), so we mark every governance field as optional
  // here — present-and-undefined is equivalent to absent.
  maxBudget?: number | null
  budgetDuration?: string | null
  maxParallelRequests?: number | null
  rpmLimit?: number | null
  tpmLimit?: number | null
  rpmLimitType?: string | null
  tpmLimitType?: string | null
  allowedRoutes?: string[] | null
  // `tags` is the read-side bucket the backend stores per-key; the
  // helper reconstructs the *write*-side `metadata: { tags: [...] }`
  // shape from this. `metadata` itself is NOT a field on the
  // VirtualKey read type — selecting it triggers
  // "Cannot query field 'metadata' on type 'VirtualKey'" — so the
  // helper doesn't read it, it builds it from `tags`.
  tags?: string[] | null
  keyType?: string
  autoRotate?: boolean | null
  rotationInterval?: string | null
}

// virtualKeyToIssueInput — translate a VirtualKey read-side row into a
// prefill shape the issue form modal can consume. Use as:
//
//   const formDraft = virtualKeyToIssueInput(selectedKey)
//   formMode.value = 'clone'
//   formOpen.value = true
//
// The returned object deliberately resets `name` to '' (the modal's
// required-field check fires until the user types something) and
// drops `duration` (the modal keeps its durationValue/durationUnit
// refs null, forcing the user to pick a new lifetime). Arrays/objects
// are shallow-copied so later mutations of the form refs don't
// back-propagate into the source VirtualKey.
export function virtualKeyToIssueInput(
  src: CloneableVirtualKeyFields,
): CloneVirtualKeyInput {
  return {
    name: '',
    modelGateway: src.modelGateway?.id ?? '',
    userId: null,
    models: src.models ? [...src.models] : null,
    maxBudget: src.maxBudget,
    budgetDuration: src.budgetDuration,
    maxParallelRequests: src.maxParallelRequests,
    rpmLimit: src.rpmLimit,
    tpmLimit: src.tpmLimit,
    rpmLimitType: src.rpmLimitType,
    tpmLimitType: src.tpmLimitType,
    allowedRoutes: src.allowedRoutes ? [...src.allowedRoutes] : null,
    // Reconstruct the wire-side metadata bucket from the read-side
    // `tags` array. Backend resolver expects `{ tags: [...] }` here;
    // an empty tags array is treated as "omit the field" by the form
    // modal's reset() (it guards on `Array.isArray(d.metadata.tags)`).
    metadata: src.tags && src.tags.length > 0 ? { tags: [...src.tags] } : null,
    keyType: src.keyType,
    autoRotate: src.autoRotate,
    rotationInterval: src.rotationInterval,
    // agentId intentionally omitted — see type comment above.
  }
}