export function isIpv4Address(value: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false
  return value.split('.').every((part) => {
    const n = Number(part)
    return Number.isInteger(n) && n >= 0 && n <= 255
  })
}

export function buildTerminalWsUrl(origin: string, ip: string): string {
  const parsed = new URL(origin)
  const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${parsed.host}/v1/terminal/${ip}`
}
