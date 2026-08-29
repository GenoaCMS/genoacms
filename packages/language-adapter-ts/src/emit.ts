import type { Attribute, AttributeType } from '@genoacms/internal/attributes'
import type { ComponentShape, Diagnostic } from '@genoacms/internal/languageAdapter'

/**
 * Emitting the entry function a component's body is wrapped in.
 *
 * The author writes a body. Everything around it comes from here, and that is what makes a component
 * impossible to get wrong in the one way that used to be possible and undetectable: the header is
 * the only statement of what the component accepts, so the signature cannot disagree with it.
 * Previously the shape was read out of a hand-written signature, and once the shape became authored
 * the two would have been maintained separately — a mismatch compiling, signing, verifying, and then
 * calling the component with the right values in the wrong parameters.
 *
 * ## A fixed name, and a default export
 *
 * The function is always `component` and always the default export, whatever the component is
 * called. A component's name is a label a person reads; it was also, until now, the identifier its
 * source had to declare, which is why a component named `my-hero` could be created and never
 * published. Emitting a fixed name separates the two: the name is free text and the identifier is
 * ours.
 *
 * ## Parameters are named after attributes, and attribute names are not identifiers
 *
 * An attribute is named in the registrar, where `Heading text` is a perfectly reasonable thing to
 * type. A parameter cannot be called that, so names are normalized — and normalizing can make two
 * distinct attributes collide, which is reported rather than resolved silently. Emitting `p0`, `p1`
 * instead would dodge both problems and leave the author writing a body against parameters with no
 * meaning, which is worse than being asked to rename something.
 *
 * **The name is `schema.title`, not `name`.** An attribute carries both, and the one called `name`
 * is not the one a person typed: it held the parameter name read out of a hand-written signature,
 * and an attribute added in the registrar has no signature to read, so it is filled with the
 * attribute's uid. Everything a person sees already uses `schema.title` — the registrar's own Name
 * field writes it, and the page editor labels its inputs from it. Emitting from `name` produced
 * parameters called `_3f2a1b…`, which is unusable to write against.
 */

/** Reserved words that would be syntax errors as a parameter name. Not exhaustive by design — */
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'await', 'implements', 'package',
  'protected', 'interface', 'private', 'public', 'arguments', 'eval'
])

/**
 * The runtime type an attribute arrives as, which is what the author's body actually receives.
 *
 * **Not the constraint encoding.** A `StringAttribute<".*", 120, "hi">` in the old hand-written
 * signature carried a pattern, a maximum length and a default, because that was how the CMS learned
 * them. It learns them from the header now, and none of them is a fact about the value at runtime —
 * a constrained string is still a string. Emitting them would put the CMS's validation vocabulary
 * into every author's signature for no benefit to the code being written.
 */
const runtimeType = (type: AttributeType): string => {
  switch (type) {
    case 'boolean': return 'boolean'
    case 'number': return 'number'
    case 'string':
    case 'text':
    case 'markdown':
    case 'richText':
      return 'string'
    // Both resolve to a list of URLs before a component is called.
    case 'link':
    case 'storageResource':
      return 'readonly string[]'
    /*
     * A slot arrives as its children, already rendered.
     *
     * **A rendered child is a DOM `Node`** — settled by the SDK when it learned to render trees, and
     * deliberately left as `unknown[]` until then rather than guessed at, because a guess would have
     * landed in the signature of every component anyone writes.
     *
     * `readonly` because the array is the renderer's, handed to a component to place. A component
     * that sorted or spliced it would be editing the page's structure from inside one of its nodes,
     * and the next render would not remember it.
     */
    case 'components': return 'readonly Node[]'
  }
}

/** An identifier for an attribute, or `undefined` if nothing usable survives normalization. */
const identifierFor = (name: string): string | undefined => {
  const stripped = name
    .replace(/[^\p{L}\p{N}_$]+(.)?/gu, (_, next: string | undefined) => next?.toUpperCase() ?? '')
  if (stripped.length === 0) return undefined
  const safe = /^[\p{L}_$]/u.test(stripped) ? stripped : `_${stripped}`
  return RESERVED.has(safe) ? `${safe}_` : safe
}

/**
 * What a person calls this attribute.
 *
 * `schema.title` is the field the registrar's Name input writes and the page editor labels from, so
 * it is the name in every sense that matters to a person. `attribute.name` is left over from
 * deriving shapes out of code and now holds a uid.
 */
const nameOf = (attribute: Attribute): string => attribute.schema.title ?? ''

/** The attributes a shape names, in the order a consumer calls them. */
const orderedAttributes = (shape: ComponentShape): Attribute[] =>
  shape.attributeOrder
    .map(reference => shape.attributes[reference])
    .filter((attribute): attribute is Attribute => attribute !== undefined)

interface Parameters {
  text: string
  diagnostics: Diagnostic[]
}

/**
 * The parameter list, and everything wrong with it.
 *
 * A collision is **fatal**: two parameters of the same name is not valid TypeScript, and guessing a
 * suffix would hand the author a parameter whose name they never chose and cannot predict.
 */
const parametersOf = (shape: ComponentShape): Parameters => {
  const diagnostics: Diagnostic[] = []
  const taken = new Map<string, string>()
  const declarations: string[] = []

  for (const attribute of orderedAttributes(shape)) {
    const name = nameOf(attribute)
    const identifier = identifierFor(name)
    if (identifier === PASSTHROUGH) {
      // The registrar refuses this name at creation. Repeated here because the emitted signature is
      // this package's to keep valid, and two parameters of one name do not compile.
      diagnostics.push({
        type: 'language-rule',
        severity: 'fatal',
        rule: 'reserved-parameter-name',
        message:
          `The attribute "${name}" becomes the parameter \`${PASSTHROUGH}\`, which every component ` +
          'already receives from the consuming application. Rename the attribute.'
      })
      continue
    }
    if (identifier === undefined) {
      diagnostics.push({
        type: 'language-rule',
        severity: 'fatal',
        rule: 'unnameable-attribute',
        message: name.trim() === ''
          // The ordinary case: an attribute was added and never named. Saying so is more use than
          // reporting that an empty string cannot be an identifier.
          ? 'One attribute has no name yet. Name it in the registrar, and it becomes a parameter.'
          : `The attribute "${name}" cannot become a parameter name. Give it a name containing ` +
            'at least one letter, digit or underscore.'
      })
      continue
    }
    const owner = taken.get(identifier)
    if (owner !== undefined) {
      diagnostics.push({
        type: 'language-rule',
        severity: 'fatal',
        rule: 'colliding-attribute-names',
        message:
          `The attributes "${owner}" and "${name}" both become the parameter ` +
          `\`${identifier}\`. Rename one of them so the two can be told apart in code.`
      })
      continue
    }
    taken.set(identifier, name)
    declarations.push(`  ${identifier}: ${runtimeType(attribute.type)}`)
  }

  return { text: declarations.join(',\n'), diagnostics }
}

interface Assembly {
  source: string
  /**
   * How many lines the emitted prologue occupies.
   *
   * The author's body starts on the next line, so a fault the compiler reports on line *n* of this
   * source is on line *n* minus this in the editor. Returned rather than kept private because
   * mapping a diagnostic back is the difference between an error an author can act on and one that
   * points at a line they never wrote.
   */
  prologueLines: number
}

/** The entry function's name, fixed so that a component's own name never has to be an identifier. */
const ENTRY_FUNCTION = 'component'

/**
 * The capability parameter every component receives, and the one name an attribute may not take.
 *
 *     attributes (positional, from attributeOrder)          passthrough
 *     ├─────────────────────────────────────────┤           ├─────────┤
 *     component(heading, body, cards,            ...        , passthrough)
 *
 * **Last, and always present.** Last because the attributes ahead of it are addressed by position,
 * so putting it first would shift every one of them. Always present because the alternative is every
 * author writing a presence check for something the SDK always supplies.
 *
 * It defaults to `{}` in the signature as well as in the SDK. A component is then callable on its
 * own — in a test, or by a consumer that grants nothing — without the parameter being undefined.
 */
const PASSTHROUGH = 'passthrough'

/** What a consumer may put in it is the consumer's decision, so the type says only that it is an object. */
const PASSTHROUGH_DECLARATION = `  ${PASSTHROUGH}: Record<string, unknown> = {}`

/**
 * The declaration a body is wrapped in.
 *
 * The single source of both the assembled module and the preview the editor shows, so the two
 * cannot disagree about what an author is writing against.
 */
const signatureOf = (shape: ComponentShape): { text: string, diagnostics: Diagnostic[] } => {
  const parameters = parametersOf(shape)
  const declarations = parameters.text.length === 0
    ? PASSTHROUGH_DECLARATION
    : `${parameters.text},\n${PASSTHROUGH_DECLARATION}`

  return {
    text: `export default function ${ENTRY_FUNCTION} (\n${declarations}\n) {`,
    diagnostics: parameters.diagnostics
  }
}

const assemble = (body: string, shape: ComponentShape): Assembly & { diagnostics: Diagnostic[] } => {
  const { text, diagnostics } = signatureOf(shape)

  return {
    source: `${text}\n${body}\n}\n`,
    prologueLines: text.split('\n').length,
    diagnostics
  }
}

export {
  ENTRY_FUNCTION,
  PASSTHROUGH,
  assemble,
  signatureOf,
  identifierFor,
  runtimeType
}
export type { Assembly }
