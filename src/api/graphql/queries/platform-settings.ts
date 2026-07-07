import { gql } from '@apollo/client/core'

// Platform-wide settings (LLD-13 + LLD-16 OQ-2): operator-editable config that used
// to be startup env. packageSourcePassword is write-only and never returned.
export const PLATFORM_SETTINGS_QUERY = gql`
  query PlatformSettings {
    platformSettings {
      agentUser
      packageSourceUrl
      packageSourceUser
    }
  }
`

export const UPDATE_PLATFORM_SETTINGS_MUTATION = gql`
  mutation UpdatePlatformSettings($input: UpdatePlatformSettingsInput!) {
    updatePlatformSettings(input: $input) {
      agentUser
      packageSourceUrl
      packageSourceUser
    }
  }
`
