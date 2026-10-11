import type { InputValue } from '$lib/components/editors/types'

const isFilledString = (value: InputValue): value is string =>
  typeof value === 'string' && value.trim() !== ''

const isRecord = (value: InputValue): value is Record<string, InputValue> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function itemSummary (value: InputValue, excludedKey: string | null = null): string {
  if (isFilledString(value)) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!isRecord(value)) return ''
  const entry = Object.entries(value).find(([key, field]) => key !== excludedKey && isFilledString(field))
  return entry ? String(entry[1]) : ''
}

function itemVariant (value: InputValue, discriminator: string | null): string {
  if (!discriminator || !isRecord(value)) return ''
  const variant = value[discriminator]
  return variant === undefined || variant === null ? '' : String(variant)
}

export { itemSummary, itemVariant }
