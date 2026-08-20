import type { KeyState } from '$lib/script/signing/keyAdministration'

/**
 * How a key's state reads on screen.
 *
 * Pure, and apart from the components, so the wording of the one distinction this screen exists to
 * make — superseded still verifies, revoked verifies nothing — is decided in a testable place. Left
 * to the markup it would be phrased twice and eventually differently.
 */

interface StateBadge {
  label: string
  /** Explains the consequence, not the word. Someone reading "superseded" needs to know it still verifies. */
  title: string
  classes: string
}

const badges: Record<KeyState, StateBadge> = {
  current: {
    label: 'current',
    title: 'New signatures are made with this key.',
    classes: 'border-success-500 text-success-600'
  },
  superseded: {
    label: 'superseded',
    title: 'No longer signs, but still verifies everything it signed. Retired, not distrusted.',
    classes: 'border-surface-300-700 opacity-80'
  },
  revoked: {
    label: 'revoked',
    title: 'Not trusted. Every signature made with it is rejected, including ones made before revocation.',
    classes: 'border-error-500 text-error-600'
  }
}

const stateBadge = (state: KeyState): StateBadge => badges[state]

/**
 * A timestamp as a date and time.
 *
 * The clock matters here: two rotations on the same day are ordinary, and a date alone would show
 * them as indistinguishable.
 */
function formatMoment (at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** How the current key stands against its rotation interval. */
type RotationStanding = 'overdue' | 'due-soon' | 'scheduled'

/** Inside this window the screen says so, so a rotation is not a surprise on the day it happens. */
const SOON_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Overdue is not an error.
 *
 * Rotation is checked when a key is about to be used, so an instance that has not signed anything
 * lately is legitimately past its interval — and the next signature will rotate it. The screen says
 * "overdue" rather than "failed" for exactly that reason.
 */
function rotationStanding (dueAt: number, now: number): RotationStanding {
  if (now >= dueAt) return 'overdue'
  return dueAt - now <= SOON_MS ? 'due-soon' : 'scheduled'
}

const standings: Record<RotationStanding, string> = {
  overdue: 'Past its interval. The next signature this instance makes will rotate it.',
  'due-soon': 'Due within the week.',
  scheduled: 'Rotates automatically when the interval is reached.'
}

const rotationExplanation = (standing: RotationStanding): string => standings[standing]

export {
  SOON_MS,
  stateBadge,
  formatMoment,
  rotationStanding,
  rotationExplanation
}

export type {
  StateBadge,
  RotationStanding
}
