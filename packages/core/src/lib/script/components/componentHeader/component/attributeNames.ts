import { PASSTHROUGH_PARAMETER } from '@genoacms/internal/languageAdapter'
import type { Attribute, ComponentHeader } from './types'

/**
 * An attribute's name is its identity in a published page, so no two may share one.
 *
 * ## Why the name, and not the uid
 *
 * A published node's `data` is keyed by the attribute's **name** — the one a person types into the
 * registrar. A publication's `attributeOrder`, by contrast, lists attribute *uids*, and the uid
 * exists so that renaming an attribute does not lose the value bound to it while a component is being
 * edited. A consumer therefore reads the order as uids and looks each value up by name, and the whole
 * mapping of values onto a component's parameters rests on a name naming exactly one attribute.
 *
 * When two share one, the second silently overwrites the first as the tree is built. The page loses
 * an attribute, the component is called with a value in the wrong parameter, and **every signature
 * over it stays valid** — the tree is signed after the collision, not before it. Nothing downstream
 * can tell it happened, which is why this is refused where a component is written rather than
 * reported where one is rendered.
 *
 * ## Refused at the header, which is below every surface
 *
 * The registrar authors both kinds of component, so this is the one place both pass through. A
 * dynamic component would also be caught later — the emitter turns names into parameters and refuses
 * a collision between two of those — but only at publication, and only for one of the two kinds. A
 * prebuilt component has no emitter and would reach a consumer unchallenged.
 *
 * ## Compared with the ends trimmed
 *
 * `Body` and `Body ` are different keys and would not collide in storage, but they are the same name
 * to the person reading them, and telling them apart in a list of attributes is not something anyone
 * should have to do. Case is **not** folded: `Body` and `body` are different names that a person
 * chose to write differently, and both survive into distinct parameters.
 */

/** What a person calls this attribute. `schema.title` is what the registrar's Name field writes. */
const nameOf = (attribute: Attribute): string => (attribute.schema.title ?? '').trim()

/**
 * The names carried by more than one attribute, each reported once and in the order first met.
 *
 * Unnamed attributes are compared like any other: several of them collide on the empty name just as
 * surely, and an author who added three attributes and named none of them has three that cannot be
 * told apart. A *single* unnamed attribute is left alone — it is an ordinary state halfway through
 * describing a component, and the emitter is what refuses to publish one.
 */
const duplicateAttributeNames = (header: ComponentHeader): string[] => {
  const seen = new Set<string>()
  const duplicated = new Set<string>()

  for (const attribute of Object.values(header.attributes)) {
    const name = nameOf(attribute)
    if (seen.has(name)) duplicated.add(name)
    seen.add(name)
  }

  return [...duplicated]
}

/** The colliding names as a person reads them, with an unnamed attribute described rather than quoted. */
const describeNames = (names: string[]): string => {
  const quoted = names.map(name => name === '' ? 'an empty name' : `"${name}"`)
  if (quoted.length === 1) return `${quoted[0]} is`
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)} are`
}

/**
 * Raised when a component would carry two attributes of one name.
 *
 * Carries the names so the message can say which, rather than that something somewhere collides.
 */
class DuplicateAttributeNameError extends Error {
  constructor (readonly names: string[]) {
    super(
      `components/duplicate-attribute-name: ${describeNames(names)} used by more than one ` +
      'attribute. A published page stores each value under its attribute\'s name, so two ' +
      'attributes sharing one would leave a component missing a value and receiving another in ' +
      'its place. Rename one of each pair.'
    )
    this.name = 'DuplicateAttributeNameError'
  }
}

/**
 * Recognizes the refusal **by name rather than by `instanceof`**.
 *
 * A route and the module raising this can be reached through different module graphs and hold
 * different copies of one class, and `instanceof` then answers `false` for the very error it was
 * written to catch — silently, and reading as an unrelated server error. That has happened twice in
 * this codebase already; see `dependents.server.ts`, which carries the same predicate for the same
 * reason.
 */
const isDuplicateAttributeName = (error: unknown): boolean =>
  error instanceof Error && error.name === 'DuplicateAttributeNameError'

/** Refuses a header whose attributes do not have distinct names. */
const requireDistinctAttributeNames = (header: ComponentHeader): void => {
  const duplicated = duplicateAttributeNames(header)
  if (duplicated.length === 0) return
  throw new DuplicateAttributeNameError(duplicated)
}

/**
 * Names an attribute may not take, because a component already receives a parameter so called.
 *
 * Refused here rather than only at publication: the registrar authors **prebuilt** components too,
 * and those never reach an emitter. Caught at creation, an author renames a field; caught at commit,
 * they have already written a body against a parameter that was never going to exist.
 *
 * Compared case-sensitively and with the ends trimmed, matching how the parameter is emitted —
 * `Passthrough` becomes a different identifier, compiles beside it, and costs nobody anything.
 */
const RESERVED_ATTRIBUTE_NAMES = new Set<string>([PASSTHROUGH_PARAMETER])

const reservedAttributeNames = (header: ComponentHeader): string[] => {
  const found = new Set<string>()
  for (const attribute of Object.values(header.attributes)) {
    const name = nameOf(attribute)
    if (RESERVED_ATTRIBUTE_NAMES.has(name)) found.add(name)
  }
  return [...found]
}

class ReservedAttributeNameError extends Error {
  constructor (readonly names: string[]) {
    super(
      `components/reserved-attribute-name: ${describeNames(names)} reserved. Every component ` +
      `already receives a \`${PASSTHROUGH_PARAMETER}\` parameter carrying whatever the consuming ` +
      'application chose to provide, so an attribute of that name would leave a component with two ' +
      'parameters it cannot tell apart. Rename the attribute.'
    )
    this.name = 'ReservedAttributeNameError'
  }
}

/** Recognized by name for the same reason as its neighbor: two module graphs, two copies of a class. */
const isReservedAttributeName = (error: unknown): boolean =>
  error instanceof Error && error.name === 'ReservedAttributeNameError'

const requireUnreservedAttributeNames = (header: ComponentHeader): void => {
  const reserved = reservedAttributeNames(header)
  if (reserved.length === 0) return
  throw new ReservedAttributeNameError(reserved)
}

export {
  nameOf,
  RESERVED_ATTRIBUTE_NAMES,
  reservedAttributeNames,
  requireUnreservedAttributeNames,
  ReservedAttributeNameError,
  isReservedAttributeName,
  duplicateAttributeNames,
  requireDistinctAttributeNames,
  DuplicateAttributeNameError,
  isDuplicateAttributeName
}
