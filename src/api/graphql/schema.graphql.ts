/**
 * GraphQL SDL — exported as a single string so it's easy to read, lint, and
 * diff. Consumed by `client.ts` via `buildSchema()` and executed by
 * `SchemaLink`. See `resolvers.ts` for the resolver map.
 *
 * Scope: covers the Agent / User / Role domain needed by AgentListView and
 * the new UserRoleView page. The `agents` Query is kept so the AgentListView
 * can drop its own fixtureLink once we wire everything through this single
 * schema — but the Agents resolvers are stubbed for now (return empty).
 */

export const typeDefs = /* GraphQL */ `
  scalar DateTime

  enum PasswordMode { AUTO CUSTOM }
  enum ConnectionStatus { ONLINE OFFLINE }
  enum SortDirection { ASC DESC }
  enum AgentStatus { RUNNING STOPPED ERROR }
  enum AgentType {
    GENERAL_CHAT
    IMAGE_GENERATION
    BASIC_LLM
    OPENCLAW
    HERMES
    CLAUDE_CODE
    XIAOGUAI
    QCODER
    OPENCODE
  }
  enum AgentSortField {
    NAME TYPE STATUS API_KEY_NAME USERNAME CREATED_AT UPDATED_AT
  }
  enum UserSortField {
    USERNAME ROLE EMAIL CONNECTION LAST_LOGIN CREATED_AT UPDATED_AT
  }

  type PageInfo { page: Int!  pageSize: Int!  totalPages: Int! }

  # ---------- Agent ----------
  type AgentApiKey { id: ID!  name: String! }
  type AgentCredentials { username: String!  passwordHash: String! }
  type Agent {
    id: ID!
    name: String!
    type: AgentType!
    status: AgentStatus!
    apiKey: AgentApiKey
    credentials: AgentCredentials!
    createdAt: DateTime!
    updatedAt: DateTime!
    endpoint: String
    templateFamilyId: ID
    templateVersionId: ID
    resourcePoolId: ID
  }
  type AgentConnection {
    nodes: [Agent!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  input AgentFilter {
    status: AgentStatus
    type: AgentType
    nameKeyword: String
    keyKeyword: String
    usernameKeyword: String
  }
  input AgentSort { field: AgentSortField!  direction: SortDirection! }

  # ---------- User & Role ----------
  type AccountRoleRef { id: ID!  name: String! }
  type AccountUser {
    id: ID!
    username: String!
    displayName: String!
    email: String!
    role: AccountRoleRef!
    connectionStatus: ConnectionStatus!
    lastLoginAt: DateTime
    enabled: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    # NOTE: passwordHash is NOT exposed here — plaintext is returned only
    # inside CreateUserPayload.generatedPassword / ResetPasswordPayload.generatedPassword.
  }
  type UserConnection {
    nodes: [AccountUser!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  type Role {
    id: ID!
    name: String!
    description: String!
    userCount: Int!
    builtIn: Boolean!
  }
  type RoleConnection {
    nodes: [Role!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  input UserFilter {
    usernameKeyword: String
    roleKeyword: String
    emailKeyword: String
    statusKeyword: ConnectionStatus
    roleId: ID
  }
  input UserSort { field: UserSortField!  direction: SortDirection! }

  input CreateUserInput {
    username: String!
    displayName: String!
    email: String!
    roleId: ID!
    passwordMode: PasswordMode!
    customPassword: String
    enabled: Boolean = true
  }
  input UpdateUserInput {
    displayName: String
    email: String
    roleId: ID
    enabled: Boolean
  }
  input AssignUsersToRoleInput { roleId: ID!  userIds: [ID!]! }

  # ---------- Resource Pool Access ----------
  enum PoolConnectionStatus { CONNECTED DISCONNECTED }
  enum ResourcePoolSyncState { SYNCED SYNCING PARTIAL FAILED NEVER }
  enum ResourcePoolSortField {
    NAME ENDPOINT CONNECTION_STATUS
    CONTENT_LIBRARY_NAME
    ESXI_HOST_COUNT VM_INSTANCE_COUNT
    CREATED_AT UPDATED_AT
  }
  type ResourcePool {
    id: ID!
    name: String!
    endpoint: String!
    contentLibraryName: String!
    connectionStatus: PoolConnectionStatus!
    esxiHostCount: Int!
    vmInstanceCount: Int!
    syncStatus: ResourcePoolSyncState!
    lastSyncedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  type ResourcePoolConnection {
    nodes: [ResourcePool!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  input ResourcePoolFilter {
    nameKeyword: String
    endpointKeyword: String
    connectionStatus: PoolConnectionStatus
  }
  input ResourcePoolSort { field: ResourcePoolSortField!  direction: SortDirection! }
  input CreateResourcePoolInput {
    name: String!
    endpoint: String!
    contentLibraryName: String!
  }
  input UpdateResourcePoolInput {
    name: String
    endpoint: String
    contentLibraryName: String
  }
  input TestResourcePoolConnectionInput {
    name: String!
    endpoint: String!
    contentLibraryName: String!
  }
  type ResourcePoolConnectionDetail {
    vSphereVersion: String!
    itemCount: Int!
  }
  type ResourcePoolConnectionTest {
    ok: Boolean!
    message: String!
    detail: ResourcePoolConnectionDetail
  }
  type CreateResourcePoolPayload { pool: ResourcePool! }
  type UpdateResourcePoolPayload { pool: ResourcePool! }
  type DeleteResourcePoolPayload { id: ID!  deletedName: String! }
  type SyncResourcePoolPayload { pool: ResourcePool!  syncedAt: DateTime! }

  # ---------- Agent Marketplace: OvaTemplateFamily + OvaTemplateVersion ----------
  enum OvaTemplateColor { BLUE PURPLE ORANGE GREEN RED CYAN }
  enum OvaTemplateFamilySortField { OVA_NAME TYPE CREATED_AT UPDATED_AT }
  type OvaTemplateFamily {
    id: ID!
    name: String!
    type: AgentType!
    description: String!
    tools: [String!]!
    scenarios: [String!]!
    skills: [String!]!
    iconShape: String!
    iconColor: OvaTemplateColor!
    versions: [OvaTemplateVersion!]!
    latestVersion: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  type OvaTemplateFamilyConnection {
    nodes: [OvaTemplateFamily!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  type OvaTemplateVersion {
    id: ID!
    familyId: ID!
    version: String!
    ovaIdentifier: String!
    notes: String
    createdAt: DateTime!
  }
  type OvaTemplateVersionConnection {
    nodes: [OvaTemplateVersion!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  input OvaTemplateFamilyFilter { nameKeyword: String  type: AgentType }
  input OvaTemplateFamilySort { field: OvaTemplateFamilySortField!  direction: SortDirection! }
  input CreateOvaTemplateVersionInput {
    version: String!
    ovaIdentifier: String!
    notes: String
  }
  input CreateOvaTemplateFamilyInput {
    name: String!
    type: AgentType!
    description: String!
    tools: [String!]!
    scenarios: [String!]!
    skills: [String!]!
    iconShape: String!
    iconColor: OvaTemplateColor!
    initialVersion: CreateOvaTemplateVersionInput!
  }
  input AddOvaTemplateVersionInput {
    familyId: ID!
    version: String!
    ovaIdentifier: String!
    notes: String
  }
  type CreateOvaTemplateFamilyPayload { family: OvaTemplateFamily! }
  type AddOvaTemplateVersionPayload { version: OvaTemplateVersion! }

  # ---------- VirtualKey ----------
  enum VirtualKeyStatus { AVAILABLE BOUND REVOKED }
  type ModelGatewayRef { id: ID!  name: String!  endpoint: String! }
  type VirtualKey {
    id: ID!
    name: String!
    secret: String!
    modelGatewayId: ID!
    modelGateway: ModelGatewayRef!
    status: VirtualKeyStatus!
    boundAgentId: ID
    boundAgent: Agent
    createdAt: DateTime!
    boundAt: DateTime
  }
  type VirtualKeyConnection {
    nodes: [VirtualKey!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  input VirtualKeyFilter {
    status: VirtualKeyStatus
    modelGatewayId: ID
    nameKeyword: String
  }
  input CreateVirtualKeyInput {
    name: String!
    modelGatewayId: ID!
  }
  type CreateVirtualKeyPayload {
    key: VirtualKey!
    secret: String!
  }

  # ---------- Deploy Agent ----------
  enum VirtualKeyMode { USE_EXISTING CREATE_NEW }
  input DeployAgentInput {
    templateVersionId: ID!
    resourcePoolId: ID!
    modelGatewayId: ID!
    virtualKeyMode: VirtualKeyMode!
    existingVirtualKeyId: ID
    newVirtualKeyName: String
    name: String!
    username: String!
    password: String!
    description: String
  }
  type DeployAgentPayload {
    agent: Agent!
    virtualKey: VirtualKey!
    templateVersion: OvaTemplateVersion!
    resourcePool: ResourcePool!
  }

  input Pagination { page: Int!  pageSize: Int! }

  type CreateUserPayload {
    user: AccountUser!
    generatedPassword: String
  }
  type ResetPasswordPayload {
    user: AccountUser!
    generatedPassword: String!
  }
  type DeleteUserPayload { id: ID! }
  type ToggleUserEnabledPayload { user: AccountUser! }
  type AssignUsersToRolePayload {
    role: Role!
    assignedCount: Int!
  }

  type Query {
    agents(filter: AgentFilter, pagination: Pagination, sort: AgentSort): AgentConnection!
    users(filter: UserFilter, pagination: Pagination, sort: UserSort): UserConnection!
    roles(pagination: Pagination): RoleConnection!
    # Single-row helper used by UserRoleView when binding users to a role.
    role(id: ID!): Role
    # Existence checks used by the front-end debounce dedupe — keeps the
    # network calls (here in-process) on the same path as real backend calls.
    userExists(username: String, email: String): Boolean!

    # ---------- Resource Pool Access ----------
    resourcePools(
      filter: ResourcePoolFilter
      pagination: Pagination
      sort: ResourcePoolSort
    ): ResourcePoolConnection!
    resourcePool(id: ID!): ResourcePool

    # ---------- Agent Marketplace ----------
    ovaTemplateFamilies(
      filter: OvaTemplateFamilyFilter
      pagination: Pagination
      sort: OvaTemplateFamilySort
    ): OvaTemplateFamilyConnection!
    ovaTemplateFamily(id: ID!): OvaTemplateFamily
    ovaTemplateVersions(familyId: ID, pagination: Pagination): OvaTemplateVersionConnection!

    # ---------- VirtualKey ----------
    virtualKeys(filter: VirtualKeyFilter, pagination: Pagination): VirtualKeyConnection!
    availableVirtualKeys(modelGatewayId: ID): [VirtualKey!]!
  }

  type Mutation {
    createUser(input: CreateUserInput!): CreateUserPayload!
    updateUser(id: ID!, input: UpdateUserInput!): AccountUser!
    deleteUser(id: ID!): DeleteUserPayload!
    resetUserPassword(id: ID!): ResetPasswordPayload!
    toggleUserEnabled(id: ID!): ToggleUserEnabledPayload!
    assignUsersToRole(input: AssignUsersToRoleInput!): AssignUsersToRolePayload!

    createResourcePool(input: CreateResourcePoolInput!): CreateResourcePoolPayload!
    updateResourcePool(id: ID!, input: UpdateResourcePoolInput!): UpdateResourcePoolPayload!
    deleteResourcePool(id: ID!): DeleteResourcePoolPayload!
    syncResourcePool(id: ID!): SyncResourcePoolPayload!
    testResourcePoolConnection(input: TestResourcePoolConnectionInput!): ResourcePoolConnectionTest!

    # ---------- Agent Marketplace ----------
    createOvaTemplateFamily(input: CreateOvaTemplateFamilyInput!): CreateOvaTemplateFamilyPayload!
    addOvaTemplateVersion(input: AddOvaTemplateVersionInput!): AddOvaTemplateVersionPayload!

    # ---------- VirtualKey ----------
    createVirtualKey(input: CreateVirtualKeyInput!): CreateVirtualKeyPayload!
    revokeVirtualKey(id: ID!): VirtualKey!

    # ---------- Deploy Agent ----------
    deployAgent(input: DeployAgentInput!): DeployAgentPayload!
  }
`