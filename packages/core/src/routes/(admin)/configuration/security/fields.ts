/**
 * What each policy value is called on screen, and what it means.
 *
 * Separate from the markup because it is a list that grows: a field added to `SecurityPolicy` gets a
 * row here and appears, rather than being wired into a form by hand. The ranges are not here — those
 * come from the parser, so a screen cannot offer one it disagrees with.
 */

interface FieldDescription {
  label: string
  describe: string
}

/** The guard ceilings, which the rest of the policy does not resemble. */
const CEILINGS = ['maxFuel', 'maxDepth', 'maxAllocation'] as const

const DESCRIPTIONS: Record<string, FieldDescription> = {
  subordinateKeyRotationDays: {
    label: 'Signing key rotation',
    describe: 'Active lifetime in days before a signing key is due for rotation.'
  },
  accessTokenMinutes: {
    label: 'Access token lifetime',
    describe: 'Access token lifetime in minutes. Also defines the maximum window a revoked permission remains active.'
  },
  grantCacheSeconds: {
    label: 'Grant cache',
    describe: 'Cache duration in seconds. Defines how quickly role permission changes take effect across instances.'
  },
  refreshTokenDays: {
    label: 'Refresh token lifetime',
    describe: 'Maximum session duration in days before requiring re-authentication.'
  },
  maxFuel: {
    label: 'Fuel',
    describe: 'Maximum loop iterations and function calls allowed per render.'
  },
  maxDepth: {
    label: 'Depth',
    describe: 'Maximum call stack nesting depth during component rendering.'
  },
  maxAllocation: {
    label: 'Allocation',
    describe: 'Total elements, strings, and buffer allocations allowed per render.'
  }
}

const describes = (field: string): FieldDescription =>
  DESCRIPTIONS[field] ?? { label: field, describe: '' }

const isCeiling = (field: string): boolean => (CEILINGS as readonly string[]).includes(field)

export { describes, isCeiling, CEILINGS }
export type { FieldDescription }
