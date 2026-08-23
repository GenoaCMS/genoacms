import { describe, it, expect } from 'vitest'
import { validator } from '@exodus/schemasafe'
import { isValidComponentName, componentNameRefusal } from './names'
import { componentCreationSchema } from './schemas'

/**
 * What a dynamic component may be called.
 *
 * The name is the function the component's source has to declare, so a name that is not a legal
 * function name is a component that can never be committed. These assert that the rule refuses at
 * creation, which is the only point at which the author can still choose a different one.
 */

const validate = validator(componentCreationSchema as never)

describe('names a component may have', () => {
  it.each(['Hero', 'hero', '_private', '$dollar', 'Hero2', 'e2eDynamicAbc123'])(
    'accepts %s',
    (name) => {
      expect(isValidComponentName(name)).toBe(true)
      expect(validate({ name })).toBe(true)
    }
  )
})

describe('names it may not', () => {
  it.each([
    ['a hyphen, which no function name may contain', 'my-hero'],
    ['a space', 'my hero'],
    ['a leading digit', '2hero'],
    ['a dot', 'my.hero'],
    ['nothing at all', '']
  ])('refuses %s', (_why, name) => {
    expect(isValidComponentName(name)).toBe(false)
    expect(validate({ name })).toBe(false)
  })

  it('refuses the shape every end-to-end fixture used to have', () => {
    // `e2e-dynamic-a1b2c3` named a component nothing could ever commit, which is what let the
    // end-to-end commit test pass without committing anything.
    expect(isValidComponentName('e2e-dynamic-a1b2c3')).toBe(false)
  })
})

describe('saying why', () => {
  it('quotes the name and states the rule', () => {
    const message = componentNameRefusal('my-hero')

    expect(message).toContain("'my-hero'")
    expect(message).toContain('the function its code declares')
  })
})
