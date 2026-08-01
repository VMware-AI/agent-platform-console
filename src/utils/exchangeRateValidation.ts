export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateRate(rate: unknown): ValidationResult {
  if (rate === '' || rate === null || rate === undefined) {
    return { valid: false, error: '汇率不能为空' }
  }
  const n = Number(rate)
  if (Number.isNaN(n)) {
    return { valid: false, error: '请输入有效数字' }
  }
  if (!Number.isFinite(n)) {
    return { valid: false, error: '汇率不能为无穷大' }
  }
  if (n <= 0) {
    return { valid: false, error: '汇率必须大于0' }
  }
  const decimalStr = String(n).split('.')[1]
  if (decimalStr && decimalStr.length > 8) {
    return { valid: false, error: '汇率最多支持8位小数' }
  }
  return { valid: true }
}

export function validateCurrencyPair(from: string, to: string): ValidationResult {
  if (!from || !to) {
    return { valid: false, error: '请选择币种' }
  }
  if (from === to) {
    return { valid: false, error: '基准币种和目标币种不能相同' }
  }
  return { valid: true }
}

export function validateEffectiveTime(time: string): ValidationResult {
  if (!time) {
    return { valid: false, error: '生效时间不能为空' }
  }
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) {
    return { valid: false, error: '请输入有效的日期时间' }
  }
  return { valid: true }
}
