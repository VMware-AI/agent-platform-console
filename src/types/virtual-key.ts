export type VirtualKeyStatus = 'active' | 'disabled' | 'revoked'

// Generic {id, name} option used by the form's gateway / agent / etc. pickers.
export interface VirtualKeyOption {
  id: string
  name: string
}