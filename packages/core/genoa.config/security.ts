import type { SecurityConfig } from '@genoacms/config'

export const security: SecurityConfig = {
  // Seeds the signed security policy document at first start; the live value lives there.
  subordinateKeyRotationDays: 90,
  // Runtime guard ceilings for dynamic components. Sized so that no reasonable presentational
  // component reaches one: a guard firing on correct code teaches operators to raise it.
  maxFuel: 1_000_000,
  maxDepth: 100,
  maxAllocation: 10_000_000
}
