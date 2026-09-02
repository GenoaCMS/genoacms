import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import type { GuardBudgets } from '@genoacms/internal/guards'

/**
 * The components E4 and E5 are measured on.
 *
 * Guard density varies sharply by control-flow shape — a loop takes one call per iteration, a
 * function takes three, an allocation takes one per site — so a single component would report one
 * point on a curve as though it were the answer. Each profile is written to be dominated by one
 * shape, and the overhead is reported per profile rather than averaged, because an average conceals
 * the worst case and the worst case is the figure that matters.
 *
 * The **sizes** exist for E5, which plots analysis latency against how large the source is. They are
 * the same shapes repeated, so what changes between them is quantity and not kind.
 */

/** What a profile's component accepts. One number to size its work, one string to build with. */
const shape: ComponentShape = {
  attributes: {
    a: { uid: 'a', name: 'count', type: 'number', schema: { title: 'count', maximum: 1000 } } as never,
    b: { uid: 'b', name: 'heading', type: 'string', schema: { title: 'heading' } } as never
  },
  attributeOrder: ['a', 'b']
}

/** Generous enough that no profile trips a guard: overhead is what is measured, not termination. */
const ceilings: GuardBudgets = { fuel: 100_000_000, depth: 10_000, allocation: 100_000_000 }

type ProfileName = 'loop' | 'recursion' | 'allocation' | 'mixed'

interface Profile {
  name: ProfileName
  /** What dominates the work, and therefore which guard is being paid for. */
  dominatedBy: string
  /** The author's body, at a given size. `size` multiplies the shape rather than changing it. */
  body: (size: number) => string
}

/**
 * A loop that does arithmetic and nothing else.
 *
 * One `tick` per iteration and no other guard on the path, so the measured difference is fuel.
 */
const loop: Profile = {
  name: 'loop',
  dominatedBy: 'fuel, one call per iteration',
  body: (size) => [
    'let total = 0',
    ...Array.from({ length: size }, (_, i) =>
      `for (let i${i} = 0; i${i} < count; i${i}++) { total += i${i} }`),
    'return String(total)'
  ].join('\n')
}

/**
 * Recursion that returns, rather than recursion that runs away.
 *
 * Every call takes `enter`, a `try`, and `exit` in a `finally` — the heaviest of the three shapes,
 * and the one where a percentage taken from a loop-only measurement would be most wrong.
 */
const recursion: Profile = {
  name: 'recursion',
  dominatedBy: 'depth, plus a try and a finally around every call',
  body: (size) => [
    ...Array.from({ length: size }, (_, i) =>
      `function down${i} (n: number): number { return n <= 0 ? 0 : down${i}(n - 1) + 1 }`),
    `return String(${Array.from({ length: size }, (_, i) => `down${i}(count)`).join(' + ')})`
  ].join('\n')
}

/**
 * Sized construction, repeated.
 *
 * One `size` call per allocation, wrapped around the argument, so the difference is the charge and
 * the arithmetic behind it rather than anything about control flow.
 */
const allocation: Profile = {
  name: 'allocation',
  dominatedBy: 'allocation, one charge per sized construction',
  body: (size) => [
    'let cells = 0',
    ...Array.from({ length: size }, (_, i) =>
      `const rows${i} = new Array(count); cells += rows${i}.length`),
    'return String(cells)'
  ].join('\n')
}

/**
 * All three at once, which is what a real component looks like.
 *
 * Present so the per-shape figures have something to be compared against: a component that is
 * entirely one shape is a bound on the overhead, not an example of it.
 */
const mixed: Profile = {
  name: 'mixed',
  dominatedBy: 'all three, in the proportions ordinary work tends to arrive in',
  body: (size) => [
    'function label (n: number): string { return String(n) }',
    'let out = ""',
    ...Array.from({ length: size }, (_, i) =>
      `const cells${i} = new Array(count)\n` +
      `for (let i${i} = 0; i${i} < cells${i}.length; i${i}++) { out += label(i${i}) }`),
    'return out'
  ].join('\n')
}

const profiles: Profile[] = [loop, recursion, allocation, mixed]

/** The sizes E5 plots against. Small enough to run quickly, spread enough to show a shape. */
const SIZES = [1, 2, 4, 8, 16, 32]

export { profiles, shape, ceilings, SIZES }
export type { Profile, ProfileName }
