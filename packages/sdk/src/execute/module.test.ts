import { describe, it, expect } from 'vitest'
import { loadModule, entryFunction } from './module.js'

/**
 * Loading and reaching into a verified module.
 *
 * Everything here runs on code whose signature, pin and platform have already been checked. What is
 * left is whether it evaluates and whether it exports what the page expects to call — two ways a
 * perfectly genuine artifact still cannot be run.
 */

describe('loading a module', () => {
  it('evaluates source and yields its exports', async () => {
    const loaded = await loadModule('export function Hero () { return "hi" }')

    expect(loaded.ok).toBe(true)
    expect(loaded.ok && typeof loaded.value.Hero).toBe('function')
  })

  it('reports a module that throws while evaluating, rather than raising', async () => {
    // A verified artifact is still code that can be wrong. One component's mistake must not become
    // the whole page's exception.
    const loaded = await loadModule('throw new Error("boom")')

    expect(loaded.ok).toBe(false)
    expect(!loaded.ok && loaded.reason).toContain('module-evaluation-failed')
  })

  it('reports source that is not valid JavaScript', async () => {
    const loaded = await loadModule('export function (')

    expect(loaded.ok).toBe(false)
    expect(!loaded.ok && loaded.reason).toContain('module-evaluation-failed')
  })

  it('uses a loader the consumer supplies instead of choosing one', async () => {
    // The seam D10 needs: a consumer whose policy forbids both URL schemes, or who runs components
    // inside a worker, supplies its own way of turning source into a module.
    const loaded = await loadModule('ignored', async () => ({ Hero: () => 'from the consumer' }))

    expect(loaded.ok && (loaded.value.Hero as () => string)()).toBe('from the consumer')
  })

  it('does not leak a rejection from a consumer-supplied loader', async () => {
    const loaded = await loadModule('ignored', async () => { throw new Error('no') })

    expect(loaded.ok).toBe(false)
  })
})

describe('reaching the entry function', () => {
  it('finds the export named after the component', async () => {
    const loaded = await loadModule('export function Hero () { return "hi" }')
    const entry = loaded.ok ? entryFunction(loaded.value, 'Hero') : undefined

    expect(entry?.ok === true && (entry.value as () => string)()).toBe('hi')
  })

  it('refuses an artifact whose entry was never exported, naming what it looked for', async () => {
    // The CMS locates a component's entry by declaration, so a source that declares `Hero` without
    // exporting it compiles, signs and publishes. It cannot be run, and this is where that surfaces.
    const loaded = await loadModule('function Hero () { return "hi" }\nexport const other = 1')
    const entry = loaded.ok ? entryFunction(loaded.value, 'Hero') : undefined

    expect(entry?.ok).toBe(false)
    expect(entry?.ok === false && entry.reason).toContain("no export named 'Hero'")
  })

  it('refuses an export that is not callable', async () => {
    const loaded = await loadModule('export const Hero = "not a component"')
    const entry = loaded.ok ? entryFunction(loaded.value, 'Hero') : undefined

    expect(entry?.ok === false && entry.reason).toContain('executable-export-not-a-function')
  })

  it('does not mistake an export from another component for this one', async () => {
    const loaded = await loadModule('export function Card () { return "card" }')
    const entry = loaded.ok ? entryFunction(loaded.value, 'Hero') : undefined

    expect(entry?.ok).toBe(false)
  })
})
