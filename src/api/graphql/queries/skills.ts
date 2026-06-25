import { gql } from '@apollo/client/core'

// Skills (技能管理) — Skill hub CRUD from the content lib (LLD-06, schema/content.graphql).
// A Skill is identified by id; the backend keys upsert by (name, version) within the
// caller's tenant. `uri` points at the skill bundle artifact; `description` is optional.
// upsertSkill / deleteSkill are both gated @hasRole(any: [admin]).

const SKILL_FIELDS = gql`
  fragment SkillFields on Skill {
    id
    name
    version
    description
    uri
    createdAt
  }
`

export const SKILLS_QUERY = gql`
  query ConsoleSkills {
    skills {
      ...SkillFields
    }
  }
  ${SKILL_FIELDS}
`

export const UPSERT_SKILL = gql`
  mutation ConsoleUpsertSkill($input: UpsertSkillInput!) {
    upsertSkill(input: $input) {
      ...SkillFields
    }
  }
  ${SKILL_FIELDS}
`

export const DELETE_SKILL = gql`
  mutation ConsoleDeleteSkill($id: ID!) {
    deleteSkill(id: $id)
  }
`

export interface SkillNode {
  id: string
  name: string
  version: string
  description: string | null
  uri: string
  createdAt: string
}

export interface SkillsResult {
  skills: SkillNode[]
}

export interface UpsertSkillInput {
  name: string
  version: string
  description?: string | null
  uri: string
}

export interface UpsertSkillVars {
  input: UpsertSkillInput
}

export interface UpsertSkillResult {
  upsertSkill: SkillNode
}

export interface DeleteSkillVars {
  id: string
}

export interface DeleteSkillResult {
  deleteSkill: boolean
}
