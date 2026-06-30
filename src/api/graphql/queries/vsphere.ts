import { gql } from '@apollo/client/core'

/**
 * Live vSphere inventory queries that power the deploy form.
 *
 * `vsphereResourcePools` lists the placement resource pools in a platform
 * resource pool's vCenter. A real OVA template has NO source resource pool, so a
 * deploy must place the clone in one of these — the picked pool's `path` is sent
 * as DeployAgentInput.targetResourcePool. Admin-only (it dials vCenter with the
 * pool's privileged credentials).
 */
export const VSPHERE_RESOURCE_POOLS_QUERY = gql`
  query VsphereResourcePools($resourcePoolId: ID!) {
    vsphereResourcePools(resourcePoolId: $resourcePoolId) {
      name
      path
    }
  }
`

export const VSPHERE_NETWORKS_QUERY = gql`
  query VsphereNetworks($resourcePoolId: ID!) {
    vsphereNetworks(resourcePoolId: $resourcePoolId) {
      name
      path
      type
      dvsName
    }
  }
`

export const CONTENT_LIBRARIES_QUERY = gql`
  query ContentLibraries($resourcePoolId: ID!) {
    contentLibraries(resourcePoolId: $resourcePoolId)
  }
`

export const CONTENT_LIBRARY_ITEMS_QUERY = gql`
  query ContentLibraryItems($resourcePoolId: ID!, $libraryName: String!) {
    contentLibraryItems(resourcePoolId: $resourcePoolId, libraryName: $libraryName) {
      name
      type
    }
  }
`
