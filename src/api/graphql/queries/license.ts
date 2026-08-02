import { gql } from '@apollo/client/core'

/**
 * Platform licensing (系统配置 → 许可管理).
 *
 * Default: 90-day trial (LICENSE_TRIAL_DAYS), armed on first licenseStatus
 * read. Licensed: an ECDSA-signed key issued by the vendor (cmd/issuelicense)
 * bound to the FIRST resource pool's vCenter IP. When the trial/license
 * elapses the backend rejects every management mutation (fail-closed).
 */

/** Current licensing state, powering the 许可管理 page. */
export const LICENSE_STATUS_QUERY = gql`
  query LicenseStatus {
    licenseStatus {
      mode
      daysRemaining
      bindIP
      trialStartedAt
      expiresAt
      customer
      edition
      activatedAt
    }
  }
`

/** The vCenter IP a license would bind to (first resource pool). */
export const LICENSE_BIND_IP_QUERY = gql`
  query LicenseBindIP {
    licenseBindIP
  }
`

/** Validate + persist a license key pasted from the vendor. */
export const ACTIVATE_LICENSE_MUTATION = gql`
  mutation ActivateLicense($key: String!) {
    activateLicense(key: $key) {
      mode
      daysRemaining
      bindIP
      trialStartedAt
      expiresAt
      customer
      edition
      activatedAt
    }
  }
`

/** License status as returned by the backend. */
export interface LicenseStatus {
  /** "trial" | "licensed" | "expired" */
  mode: string
  /** Whole days until the trial or license expires (0 when expired). */
  daysRemaining: number
  /** The vCenter IP the license binds to (first resource pool's endpoint). */
  bindIP: string
  /** When trial mode started (empty until the first status read). */
  trialStartedAt?: string | null
  /** Trial or license expiry date. */
  expiresAt: string
  /** Licensee name (licensed mode only). */
  customer?: string | null
  /** Licensed edition (licensed mode only). */
  edition?: string | null
  /** When the license key was activated (licensed mode only). */
  activatedAt?: string | null
}
