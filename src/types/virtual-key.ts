export type VirtualKeyStatus = 'active' | 'disabled' | 'revoked'

export interface VirtualKey {
  id: string
  // Display alias (backend `alias`); may be empty when the key was issued without one.
  name: string
  userId: string
  agentId: string | null
  status: VirtualKeyStatus
  createdAt: string
  expiresAt: string | null
  policyId: string | null
  // Resolved rate-limit policy name for display ('—' when unbound / unknown).
  policyName: string
}

// A key is an immutable credential: issue collects these once; there is no edit.
export interface VirtualKeyDraft {
  name: string
  userId: string
  agentId: string
  policyId: string
  expiresAt: string
}

// Generic {id, name} option for the owner / agent / policy selectors.
export interface VirtualKeyOption {
  id: string
  name: string
}
