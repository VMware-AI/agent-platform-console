import { describe, expect, it } from 'vitest'
import { buildTerminalWsUrl, isIpv4Address } from '@/utils/terminal'

describe('terminal utils', () => {
  it('builds a same-origin ws url for http origins', () => {
    expect(buildTerminalWsUrl('http://10.121.166.205:18080', '172.16.85.229')).toBe(
      'ws://10.121.166.205:18080/v1/terminal/172.16.85.229',
    )
  })

  it('builds a same-origin wss url for https origins', () => {
    expect(buildTerminalWsUrl('https://10.121.166.205', '172.16.85.229')).toBe(
      'wss://10.121.166.205/v1/terminal/172.16.85.229',
    )
  })

  it('validates ipv4 addresses with the current terminal guard', () => {
    expect(isIpv4Address('172.16.85.229')).toBe(true)
    expect(isIpv4Address('172.16.85.256')).toBe(false)
    expect(isIpv4Address('agent-01')).toBe(false)
  })
})
