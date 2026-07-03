/**
 * GraphQL types — agent marketplace (OVA template families / versions /
 * deploy-agent input / vsphere placement options). Mirrors the backend
 * schema; replace with codegen output when available.
 *
 * Cross-domain references: DeployAgentPayload / OvaTemplateFamily /
 * query-vars types reference Agent / AgentType / PageInfo / SortDirection /
 * Pagination (agents domain) and ResourcePool (resource-pool domain);
 * consumers that need both should import from each domain file directly.
 */
import type { Agent, AgentType, PageInfo, SortDirection, Pagination } from './agents'
import type { ResourcePool } from './resource-pool'

export type OvaTemplateColor = 'BLUE' | 'PURPLE' | 'ORANGE' | 'GREEN' | 'RED' | 'CYAN'

export interface OvaTemplateVersion {
  id: string
  familyId: string
  version: string
  ovaIdentifier: string
  notes: string | null
  createdAt: string
}

export interface OvaTemplateFamily {
  id: string
  name: string
  type: AgentType
  description: string
  tools: string[]
  scenarios: string[]
  skills: string[]
  iconShape: string
  iconColor: OvaTemplateColor
  versions: OvaTemplateVersion[]
  latestVersion: string | null
  createdAt: string
  updatedAt: string
}

export interface OvaTemplateFamilyConnection {
  nodes: OvaTemplateFamily[]
  totalCount: number
  pageInfo: PageInfo
}

export type OvaTemplateFamilySortField = 'OVA_NAME' | 'TYPE' | 'CREATED_AT' | 'UPDATED_AT'

export interface OvaTemplateFamilyFilter {
  nameKeyword?: string | null
  type?: AgentType | null
}

export interface OvaTemplateFamilySort {
  field: OvaTemplateFamilySortField
  direction: SortDirection
}

export interface OvaTemplateFamiliesQueryVars {
  filter?: OvaTemplateFamilyFilter | null
  pagination?: Pagination | null
  sort?: OvaTemplateFamilySort | null
}

export interface OvaTemplateFamiliesQueryResult {
  ovaTemplateFamilies: OvaTemplateFamilyConnection
}

export interface OvaTemplateVersionConnection {
  nodes: OvaTemplateVersion[]
  totalCount: number
  pageInfo: PageInfo
}

export interface OvaTemplateVersionsQueryVars {
  familyId?: string | null
  pagination?: Pagination | null
}

export interface OvaTemplateVersionsQueryResult {
  ovaTemplateVersions: OvaTemplateVersionConnection
}

export interface CreateOvaTemplateVersionInput {
  version: string
  ovaIdentifier: string
  notes?: string | null
}

export interface CreateOvaTemplateFamilyInput {
  name: string
  type: AgentType
  description: string
  tools: string[]
  scenarios: string[]
  skills: string[]
  iconShape: string
  iconColor: OvaTemplateColor
  initialVersion: CreateOvaTemplateVersionInput
}

export interface AddOvaTemplateVersionInput {
  familyId: string
  version: string
  ovaIdentifier: string
  notes?: string | null
}

export interface CreateOvaTemplateFamilyPayload {
  family: OvaTemplateFamily
}

export interface AddOvaTemplateVersionPayload {
  version: OvaTemplateVersion
}

export interface CreateOvaTemplateFamilyVars {
  input: CreateOvaTemplateFamilyInput
}

export interface AddOvaTemplateVersionVars {
  input: AddOvaTemplateVersionInput
}

/* ============================================================
 * Content Library Items (OVA template picker in Add OVA Template dialog)
 * ============================================================ */

export interface ContentLibraryItem {
  name: string
  type: string
}

export interface ContentLibrariesQueryVars {
  resourcePoolId: string
}

export interface ContentLibrariesQueryResult {
  contentLibraries: string[]
}

export interface ContentLibraryItemsQueryVars {
  resourcePoolId: string
  libraryName: string
}

export interface ContentLibraryItemsQueryResult {
  contentLibraryItems: ContentLibraryItem[]
}

/* ============================================================
 * Deploy Agent (create-from-OVA)
 *
 * The marketplace deploys a NEW agent from an OVA template version. Deploy ISSUES
 * the gateway key itself and returns its secret ONCE via `virtualKeySecret` — the
 * marketplace has no separate VirtualKey concept (that collided with the real
 * LiteLLM VirtualKey type; see queries/virtual-keys.ts + VirtualKeyView.vue).
 * ============================================================ */

export interface DeployAgentInput {
  /** Display name for the new agent (and its cloned VM). */
  name: string
  /** OVA family (its type becomes the agent kind) + the version to clone from. */
  templateFamilyId: string
  templateVersionId: string
  /** Target vCenter resource pool. */
  resourcePoolId: string
  /**
   * Optional vSphere resource-pool inventory PATH to place the VM clone in
   * (VsphereResourcePool.path, e.g. "/DC0/host/DC0_C0/Resources"). A true OVA
   * template has no source resource pool, so a real deploy must supply one or
   * the clone fails ("source has no resource pool; specify resourcePool").
   * Empty = inherit the source template's pool (only valid for regular-VM sources).
   */
  targetResourcePool?: string | null
  /** Optional cloud-init hostname for the VM. */
  hostname?: string | null
  /** Optional per-key spend cap handed to the gateway. */
  maxBudget?: number | null
  /** Optional target portgroup path for the agent VM's NIC (VsphereNetwork.path). */
  targetNetwork?: string | null
  /**
   * Optional one-time initial password seeded into the VM on first boot (web
   * console htpasswd + OS user credentials; see backend PR #112). Bounds must
   * match the backend: ≥12 chars, ≤72 UTF-8 bytes, no leading/trailing
   * whitespace, no control characters, no ':'. Null/empty = the VM is
   * provisioned without initial credentials.
   */
  initialPassword?: string | null
}

export interface DeployAgentPayload {
  agent: Agent
  /** The issued virtual-key secret — returned ONCE; show in a reveal dialog. */
  virtualKeySecret: string
  templateVersion: OvaTemplateVersion
  resourcePool: ResourcePool
}

export interface DeployAgentVars {
  input: DeployAgentInput
}

/**
 * A vCenter resource pool offered as a placement target for the cloned VM.
 * `path` is the inventory path (e.g. "/DC0/host/DC0_C0/Resources") sent as
 * DeployAgentInput.targetResourcePool; `name` is the human label.
 */
export interface VsphereResourcePool {
  name: string
  path: string
}

export interface VsphereResourcePoolsQueryVars {
  resourcePoolId: string
}

export interface VsphereResourcePoolsQueryResult {
  vsphereResourcePools: VsphereResourcePool[]
}

/** A vCenter portgroup (standard or distributed) shown in the deploy form's NIC picker. */
export interface VsphereNetwork {
  name: string
  path: string
  type: string
  dvsName: string
}

export interface VsphereNetworksQueryVars {
  resourcePoolId: string
}

export interface VsphereNetworksQueryResult {
  vsphereNetworks: VsphereNetwork[]
}
