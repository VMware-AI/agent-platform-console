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
