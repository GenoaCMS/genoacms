/**
 * What a dynamic component may be called.
 *
 * A component's name **is** the function its source has to declare: committing looks for a function
 * of exactly that name and refuses when it is absent. So a name that cannot be a function name is a
 * component that can never be committed — the author is told no such function is declared, and
 * cannot declare one, because `my-hero` is not something a source file can name.
 *
 * The rule is stated here rather than inline in the schema so that the refusal at creation and the
 * explanation at commit time cannot drift apart.
 *
 * ## Why the name, rather than something derived from it
 *
 * Keeping one name means what an author reads on the component card is what they type in their
 * source. A derived identifier would be a second name for the same thing, and the editor would have
 * to display it or the author would be guessing.
 */

/**
 * ECMAScript identifiers, restricted to ASCII.
 *
 * Narrower than the language allows — `café` is a legal identifier — because the name is also a
 * storage key and a label, and a rule an author can hold in their head is worth more here than the
 * last few characters of expressiveness.
 */
const COMPONENT_NAME_PATTERN = '^[A-Za-z_$][A-Za-z0-9_$]*$'

const componentNameRule = new RegExp(COMPONENT_NAME_PATTERN)

const isValidComponentName = (name: string): boolean =>
  typeof name === 'string' && componentNameRule.test(name)

/** Says what is wrong with a name, in the terms an author needs to fix it. */
const componentNameRefusal = (name: string): string =>
  `'${name}' cannot be a component name. A component's name is the function its code declares, so ` +
  'it must start with a letter, underscore or dollar sign and contain only letters, digits, ' +
  'underscores and dollar signs.'

export {
  COMPONENT_NAME_PATTERN,
  isValidComponentName,
  componentNameRefusal
}
