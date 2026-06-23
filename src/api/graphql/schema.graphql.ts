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
    PYTHON_AUTOMATION
    GENERAL_CHAT
    CODE_ANALYSIS
    DATA_ANALYSIS
    IMAGE_GENERATION
  }
  enum AgentSortField {
    NAME TYPE STATUS API_KEY_NAME OWNER CREATED_AT UPDATED_AT
  }
  enum UserSortField {
    USERNAME ROLE EMAIL CONNECTION LAST_LOGIN CREATED_AT UPDATED_AT
  }

  type PageInfo { page: Int!  pageSize: Int!  totalPages: Int! }

  # ---------- Agent (legacy — read-only) ----------
  type AgentApiKey { id: ID!  name: String! }
  type User { id: ID!  displayName: String!  email: String! }
  type Agent {
    id: ID!
    name: String!
    type: AgentType!
    typeLabel: String!
    status: AgentStatus!
    apiKey: AgentApiKey
    owner: User
    createdAt: DateTime!
    updatedAt: DateTime!
    endpoint: String
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
    ownerKeyword: String
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
  enum ResourcePoolSortField {
    NAME ENDPOINT CONNECTION_STATUS
    DATACENTER_COUNT CLUSTER_COUNT ESXI_HOST_COUNT VM_INSTANCE_COUNT
    CREATED_AT UPDATED_AT
  }
  type ResourcePool {
    id: ID!
    name: String!
    endpoint: String!
    connectionStatus: PoolConnectionStatus!
    datacenterCount: Int!
    clusterCount: Int!
    esxiHostCount: Int!
    vmInstanceCount: Int!
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
    datacenterCount: Int
    clusterCount: Int
  }
  input UpdateResourcePoolInput {
    name: String
    endpoint: String
    datacenterCount: Int
    clusterCount: Int
  }
  type CreateResourcePoolPayload { pool: ResourcePool! }
  type UpdateResourcePoolPayload { pool: ResourcePool! }
  type DeleteResourcePoolPayload { id: ID!  deletedName: String! }
  type SyncResourcePoolPayload { pool: ResourcePool!  syncedAt: DateTime! }

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
  }
`