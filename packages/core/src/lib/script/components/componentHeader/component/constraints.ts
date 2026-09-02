/**
 * Writing a meta-schema constraint, or removing it when it is unset.
 *
 * An unset constraint is **omitted**, never written as an empty value. Component entries are signed
 * over their RFC 8785 canonical form, and `JCS({"pattern": ""})` and `JCS({})` are different byte
 * streams and therefore different digests — so two producers disagreeing about which to write make
 * the same component sign two ways. That is not hypothetical: the analyzer omitted these keys while
 * `attributeInits.ts` wrote them, and a component authored in code signed differently from the same
 * component registered by hand.
 *
 * Three near-misses all fail, and only removal works:
 *
 * - `null` — rejected outright by the schema.
 * - `undefined` — a property assigned `undefined` is still a property, and fails validation as
 *   `null` does. This is the subtle one, and the reason a two-way binding cannot express omission:
 *   `bind:` can only assign.
 * - an **empty value** — `''` or `[]`. It validates, so nothing complains, and it is a second way to
 *   say "not set" beside omission, and one fact with two spellings is what makes two entries
 *   meaning the same thing sign differently.
 *
 * This is deliberately *not* a normalization pass over a finished entry. A layer tidying values on
 * the way out would leave every producer free to keep emitting the wrong shape with nothing
 * objecting, and the guarantee would weaken from *equal* to *equal after tidying*. The rule lives
 * here, and producers call it as they write.
 */

/** Whether a value stands for "no constraint" rather than for a constraint. */
function isUnset (value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  return Array.isArray(value) && value.length === 0
}

/**
 * Sets `constraint` on `schema`, or deletes it when the value is unset.
 *
 * `delete` is reactive on a Svelte state proxy, so an editor calling this updates what is stored.
 */
function setConstraint (schema: object, constraint: string, value: unknown): void {
  const target = schema as Record<string, unknown>
  if (isUnset(value)) {
    delete target[constraint]
    return
  }
  target[constraint] = value
}

export { isUnset, setConstraint }
