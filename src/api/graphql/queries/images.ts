import { gql } from '@apollo/client/core'

// Harbor / 镜像仓 images (LLD-06). Each Image is a versioned container image
// identified by `repository:tag`, optionally pinned to an immutable `digest` and
// flagged `signed` once a cosign/notation signature has been verified. The
// backend keys upsert by repository+tag within the caller's scope, so the
// create/edit form treats that pair as the row identity.
//
// Op names are unique PascalCase to avoid collisions with sibling modules.
// query images / mutation upsertImage / mutation deleteImage are all defined in
// schema/content.graphql:
//   images: [Image!]!                              (no directive)
//   upsertImage(input: UpsertImageInput!): Image!  @hasRole(any: [admin])
//   deleteImage(id: ID!): Boolean!                 @hasRole(any: [admin])

const IMAGE_FIELDS = gql`
  fragment ImageFields on Image {
    id
    repository
    tag
    digest
    signed
    createdAt
  }
`

export const IMAGES_QUERY = gql`
  query HarborImages {
    images {
      ...ImageFields
    }
  }
  ${IMAGE_FIELDS}
`

export const UPSERT_IMAGE = gql`
  mutation UpsertHarborImage($input: UpsertImageInput!) {
    upsertImage(input: $input) {
      ...ImageFields
    }
  }
  ${IMAGE_FIELDS}
`

export const DELETE_IMAGE = gql`
  mutation DeleteHarborImage($id: ID!) {
    deleteImage(id: $id)
  }
`

export interface ImageNode {
  id: string
  repository: string
  tag: string
  digest: string | null
  signed: boolean
  createdAt: string
}

export interface ImagesResult {
  images: ImageNode[]
}

export interface UpsertImageVars {
  input: {
    repository: string
    tag: string
    digest?: string | null
    signed?: boolean
  }
}

export interface UpsertImageResult {
  upsertImage: ImageNode
}

export interface DeleteImageVars {
  id: string
}

export interface DeleteImageResult {
  deleteImage: boolean
}
