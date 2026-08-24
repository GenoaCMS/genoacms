import { describe, it, expect } from 'vitest'
import { readExecutable, matchesPin, isRunnable, WEB_ESMODULE } from './executable.js'
import type { ComponentExecutable } from './executable.js'

/**
 * What a valid signature does not settle.
 *
 * All three checks here run on an artifact that has already verified. Each covers a case where every
 * signature involved is genuine and the artifact is still the wrong one to run.
 */

const artifact = (over: Partial<ComponentExecutable> = {}): ComponentExecutable => ({
  uid: 'component-1',
  commitId: 'commit-2',
  authorId: 'user-1',
  committedAt: 1_700_000_000_000,
  platform: WEB_ESMODULE,
  executableCode: 'export function Hero () { return 1 }',
  compiledAt: 1_700_000_001_000,
  ...over
})

const read = (candidate: unknown) => readExecutable(candidate as never)

describe('reading an executable', () => {
  it('reads a well-formed one', () => {
    expect(read(artifact())).toEqual({ ok: true, value: artifact() })
  })

  it.each([
    ['uid', 'executable-missing-uid'],
    ['commitId', 'executable-missing-commit-id'],
    ['authorId', 'executable-missing-author-id'],
    ['platform', 'executable-missing-platform'],
    ['executableCode', 'executable-missing-code']
  ])('refuses a missing %s', (field, reason) => {
    const { [field as keyof ComponentExecutable]: _dropped, ...rest } = artifact()

    expect(read(rest)).toEqual({ ok: false, reason })
  })

  it('refuses an empty bundle, which renders nothing while claiming it was meant to', () => {
    expect(read(artifact({ executableCode: '' }))).toEqual({ ok: false, reason: 'executable-missing-code' })
  })

  it('refuses an artifact attributing itself to nobody', () => {
    // Attribution is what makes the audit trail real; rendering it anonymously would discard that.
    expect(read(artifact({ authorId: '' }))).toEqual({ ok: false, reason: 'executable-missing-author-id' })
  })

  it('refuses something that is not an object at all', () => {
    expect(read('an artifact')).toEqual({ ok: false, reason: 'executable-not-an-object' })
  })
})

describe('matching the revision the page pinned', () => {
  it('accepts the artifact the page asked for', () => {
    expect(matchesPin(artifact(), { uid: 'component-1', commitId: 'commit-2' }).ok).toBe(true)
  })

  it('refuses a genuine artifact of an older revision', () => {
    // The attack this exists for: move a real, correctly signed older executable to the path a newer
    // one occupies. Every signature stays valid and the page renders code it did not publish.
    const result = matchesPin(artifact({ commitId: 'commit-1' }), { uid: 'component-1', commitId: 'commit-2' })

    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.reason).toContain('executable-wrong-revision')
  })

  it('refuses a genuine artifact of a different component', () => {
    const result = matchesPin(artifact({ uid: 'component-9' }), { uid: 'component-1', commitId: 'commit-2' })

    expect(!result.ok && result.reason).toContain('executable-wrong-component')
  })
})

describe('refusing a platform this SDK cannot run', () => {
  it('accepts a web ES module', () => {
    expect(isRunnable(artifact()).ok).toBe(true)
  })

  it('refuses one built for another runtime, and says what it runs', () => {
    // Not a corrupted artifact: a correctly signed one meant for a different SDK.
    const result = isRunnable(artifact({ platform: 'android-dex' }))

    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.reason).toContain('android-dex')
    expect(!result.ok && result.reason).toContain(WEB_ESMODULE)
  })

  it('accepts a platform a caller declares it can run', () => {
    expect(isRunnable(artifact({ platform: 'node-esmodule' }), [WEB_ESMODULE, 'node-esmodule']).ok).toBe(true)
  })
})
