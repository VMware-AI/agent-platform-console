import { gql } from '@apollo/client/core'

const PLATFORM_SETTINGS_FIELDS = /* GraphQL */ `
  fragment PlatformSettingsFields on PlatformSettings {
    agentUser
  }
`

export const PLATFORM_SETTINGS_QUERY = gql`
  ${PLATFORM_SETTINGS_FIELDS}
  query PlatformSettings {
    platformSettings {
      ...PlatformSettingsFields
    }
  }
`

/* ---------- Mutations ---------- */

export const UPDATE_PLATFORM_SETTINGS_MUTATION = gql`
  ${PLATFORM_SETTINGS_FIELDS}
  mutation UpdatePlatformSettings($input: UpdatePlatformSettingsInput!) {
    updatePlatformSettings(input: $input) {
      ...PlatformSettingsFields
    }
  }
`

export { PLATFORM_SETTINGS_FIELDS }
