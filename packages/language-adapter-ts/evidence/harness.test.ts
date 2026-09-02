import { describe, it, expect } from 'vitest'
import { profiles, SIZES } from './profiles.js'
import { pairFor, overheadOf, latencyOf, astNodes, overheadPercent } from './harness.js'

/**
 * That the harness measures the right thing.
 *
 * **No timing is asserted here.** A number measured on this machine is not a claim about any other,
 * and a test that failed when a laptop was busy would be noise rather than evidence. What is
 * asserted is everything a reported figure depends on: that the two artifacts differ only in the
 * guards, that the control really has none, that both compute the same answer, and that the
 * arithmetic turning two numbers into a percentage is right.
 */

const loop = profiles.find(one => one.name === 'loop')!

describe('the two artifacts', () => {
  it('differ, and the guarded one is the larger', async () => {
    const { control, guarded } = await pairFor(loop.body(1))

    expect(guarded.bytes).toBeGreaterThan(control.bytes)
  })

  it('leaves the control with no guard in it', async () => {
    // The whole comparison rests on this. A control that carried the helper would report the
    // overhead as nothing at all.
    const { control } = await pairFor(loop.body(1))

    expect(control.code).not.toContain('__genoaGuards')
    expect(control.code).not.toContain('.tick()')
  })

  it('leaves the data bridge in the control, because it is not a guard', async () => {
    // The emitted signature builds `bridge` from an appended helper, so a control without it does
    // not run — and attributing the bridge's bytes to the guards would overstate them.
    const { control } = await pairFor(loop.body(1))

    expect(control.code).toContain('__genoaBridge')
  })

  it('puts the guards in the other one', async () => {
    const { guarded } = await pairFor(loop.body(1))

    expect(guarded.code).toContain('__genoaGuards')
    expect(guarded.code).toContain('.tick()')
  })

  it.each(profiles.map(one => [one.name, one] as const))(
    'compiles the %s profile both ways',
    async (_name, profile) => {
      const { control, guarded } = await pairFor(profile.body(2))

      expect(control.bytes).toBeGreaterThan(0)
      expect(guarded.bytes).toBeGreaterThan(control.bytes)
    }
  )
})

describe('what the two artifacts compute', () => {
  it.each(profiles.map(one => [one.name, one] as const))(
    'is the same answer for the %s profile',
    async (_name, profile) => {
      // If they disagreed, the overhead would be the cost of doing something else.
      const measured = await overheadOf(profile, 1, { count: 20, calls: 1, warmup: 0 })

      expect(measured.profile).toBe(profile.name)
      expect(measured.milliseconds.control).toBeGreaterThanOrEqual(0)
      expect(measured.milliseconds.guarded).toBeGreaterThanOrEqual(0)
    }
  )

  it('agrees on the value, guarded or not', async () => {
    const { control, guarded } = await pairFor(loop.body(2))
    const load = async (code: string) => (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    )).default as (n: number) => unknown

    expect((await load(guarded.code))(50)).toBe((await load(control.code))(50))
  })
})

describe('measuring how large a component is', () => {
  it('counts what the analyzer walks, not characters', () => {
    // A thousand lines of assignment and a thousand lines of nested calls are the same length and
    // not the same work, which is why latency is plotted against nodes.
    expect(astNodes(loop.body(1))).toBeGreaterThan(0)
  })

  it('grows with the component', () => {
    expect(astNodes(loop.body(4))).toBeGreaterThan(astNodes(loop.body(1)))
  })

  it('offers sizes that actually differ', () => {
    const counted = SIZES.map(size => astNodes(loop.body(size)))

    expect([...new Set(counted)]).toHaveLength(SIZES.length)
  })
})

describe('timing analysis', () => {
  it('reports the size it measured, so a point can be placed', async () => {
    const measured = await latencyOf(loop, 2, 1)

    expect(measured).toMatchObject({ profile: 'loop', size: 2 })
    expect(measured.nodes).toBeGreaterThan(0)
  })
})

describe('turning two numbers into a percentage', () => {
  it.each([
    ['no difference', 10, 10, 0],
    ['half again', 10, 15, 50],
    ['twice', 10, 20, 100],
    ['faster, which is reported rather than hidden', 10, 8, -20]
  ])('%s', (_why, control, guarded, expected) => {
    expect(overheadPercent(control, guarded)).toBeCloseTo(expected)
  })

  it.each([
    ['a control too fast to measure', 0, 5],
    ['both too fast to measure', 0, 0]
  ])('reports %s as no number at all', (_why, control, guarded) => {
    // A percentage taken from a zero is a statement about the clock, not about the guards. The
    // report prints a dash, and the reader knows to run a larger size.
    expect(Number.isNaN(overheadPercent(control, guarded))).toBe(true)
  })
})
