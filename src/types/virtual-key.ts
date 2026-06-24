export interface VirtualKey {
  id: string
  name: string
  secret: string
  agentId: string
  enabled: boolean
  createdAt: string
  expiresAt: string
  policy: string
}

export interface VirtualKeyDraft {
  name: string
  agentId: string
  enabled: boolean
  expiresAt: string
  policy: string
}

export interface VirtualKeyAgentOption {
  id: string
  name: string
}
