import { describe, expect, it } from 'vitest'

import { PROVIDER_DEFAULT_API_BASE, PROVIDER_OPTIONS } from '../supplier-model'

describe('supplier model provider options', () => {
  it('includes LiteLLM ollama_chat for local Ollama upstreams', () => {
    expect(PROVIDER_OPTIONS).toContain('ollama_chat')
    expect(PROVIDER_DEFAULT_API_BASE.ollama_chat).toBe('http://10.121.166.222:11434')
  })
})
