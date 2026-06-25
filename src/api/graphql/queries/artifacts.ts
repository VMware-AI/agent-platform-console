import { gql } from '@apollo/client/core'

// 制品库 (Artifacts & versions, LLD-06). An Artifact is a single (name, version)
// row of a given ArtifactKind (script / config / package / knowledge). The
// backend keys `upsertArtifact` by (name, version) within the caller's tenant,
// so creating a new version of an existing name is just another upsert; the
// master-detail UI groups rows by name and lists every version on the right.
//
// This module is intentionally separate from the KnowledgeArtifacts query in
// queries/agent-config.ts (which is scoped to kind=knowledge for the agent-config
// picker); this one covers all artifact kinds and owns the CRUD mutations.

const ARTIFACT_FIELDS = gql`
  fragment ArtifactFields on Artifact {
    id
    name
    kind
    version
    uri
    content
    sha256
    metadata
    createdAt
  }
`

// `artifacts(kind:)` — omit the variable for "all kinds".
export const PLATFORM_ARTIFACTS_QUERY = gql`
  query PlatformArtifacts($kind: ArtifactKind) {
    artifacts(kind: $kind) {
      ...ArtifactFields
    }
  }
  ${ARTIFACT_FIELDS}
`

// `artifactVersions(name:)` — every version of a named artifact, newest first.
export const PLATFORM_ARTIFACT_VERSIONS_QUERY = gql`
  query PlatformArtifactVersions($name: String!) {
    artifactVersions(name: $name) {
      ...ArtifactFields
    }
  }
  ${ARTIFACT_FIELDS}
`

export const UPSERT_PLATFORM_ARTIFACT = gql`
  mutation UpsertPlatformArtifact($input: UpsertArtifactInput!) {
    upsertArtifact(input: $input) {
      ...ArtifactFields
    }
  }
  ${ARTIFACT_FIELDS}
`

export const DELETE_PLATFORM_ARTIFACT = gql`
  mutation DeletePlatformArtifact($id: ID!) {
    deleteArtifact(id: $id)
  }
`

// Mirrors the backend ArtifactKind enum (schema/content.graphql).
export const ARTIFACT_KINDS = ['script', 'config', 'package', 'knowledge'] as const
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]

export interface ArtifactNode {
  id: string
  name: string
  kind: ArtifactKind
  version: string
  uri: string
  content: string | null
  sha256: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface PlatformArtifactsResult {
  artifacts: ArtifactNode[]
}

export interface PlatformArtifactsVars {
  kind?: ArtifactKind
}

export interface PlatformArtifactVersionsResult {
  artifactVersions: ArtifactNode[]
}

export interface PlatformArtifactVersionsVars {
  name: string
}

export interface UpsertArtifactInputVars {
  name: string
  kind: ArtifactKind
  version: string
  uri: string
  content?: string | null
  sha256?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpsertPlatformArtifactVars {
  input: UpsertArtifactInputVars
}

export interface UpsertPlatformArtifactResult {
  upsertArtifact: ArtifactNode
}

export interface DeletePlatformArtifactVars {
  id: string
}

export interface DeletePlatformArtifactResult {
  deleteArtifact: boolean
}
