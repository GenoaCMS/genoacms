import type {
  Attribute,
  AttributeBase,
  BooleanAttribute,
  ComponentHeaderAttributes,
  LinksMetaSchema,
  StorageResourcesMetaSchema
} from '@genoacms/internal/attributes'
import type { Diagnostic } from '@genoacms/internal/languageAdapter'
import type { FunctionDeclaration, Node, ParameterDeclaration } from 'ts-morph'

import { Project } from 'ts-morph'

/**
 * Deriving a component's attributes from its TypeScript source.
 *
 * Moved here from the CMS unchanged in behavior. What is different is the boundary: this reports
 * what it cannot handle as a **diagnostic** rather than by throwing, because an adapter's job is to
 * tell the CMS what is wrong with a source file, not to decide what the CMS does about it.
 */

/** Where a node is, as the 1-based line and column an editor shows. */
const locate = (node: Node): Pick<Diagnostic, 'line' | 'column'> => ({
  line: node.getStartLineNumber(),
  column: node.getStart() - node.getStartLinePos() + 1
})

interface AttributeCodeType {
  name: string
  arguments: Array<string>
}

/**
 * Type arguments in component code are optional and positional, so any of them
 * may be absent.
 *
 * "Not set" is expressed by **omitting the key**. Neither alternative
 * works: `null` canonicalizes to different bytes from an absent key, so two
 * equivalent attributes would sign differently, and `undefined` is refused
 * outright by the signer, which insists omission be a deliberate act rather
 * than a dropped member.
 *
 * `parseFloat` was used here and is not safe for this: a missing argument
 * yields `NaN`, which JSON cannot represent at all.
 */
function optionalNumber (raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? undefined : parsed
}

function optionalString (raw: string | undefined): string | undefined {
  const trimmed = unquote(raw?.trim())
  // An empty argument is an unsupplied one. Storing '' would be a second way to
  // say "unset" beside omission, and two ways to say it is the ambiguity
  // that makes two equivalent attributes sign differently.
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

/**
 * The value of a string type argument, without the quotes that delimit it.
 *
 * The argument text arrives as it was written — `"hello"`, six characters — so
 * storing it verbatim put the quotes inside the value. A default then rendered
 * as `"hello"` and `ComponentsAttribute<"Card", 3, "Card|Hero">` yielded the
 * allowed components `"Card` and `Hero"`, neither of which matches a component.
 *
 * Longstanding, and invisible until the shape came under a signature: what is
 * signed is the value, so a stray quote is a different document.
 */
function unquote (raw: string | undefined): string | undefined {
  if (raw === undefined || raw.length < 2) return raw
  const first = raw[0]
  const isQuoted = (first === '"' || first === "'" || first === '`') && raw.endsWith(first)
  return isQuoted ? raw.slice(1, -1) : raw
}

/**
 * A schema key, present only when its argument was supplied.
 *
 * Spread into the meta-schema so that an absent argument leaves no trace. The
 * mapped return type keeps the key optional, so the result still satisfies the
 * meta-schema interface.
 */
function optional<K extends string, T> (key: K, value: T | undefined): { [P in K]?: T } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: T }
}

// every attribute's meta-schema carries the fields the editor's shared header
// binds to: title, description and required
interface MetaSchemaBase {
  title: string
  description: string
  required: boolean
}

function parseAttributeType (text: string): AttributeCodeType {
  const [name, rawArgs] = text.split('<')
  if (!rawArgs) return { name, arguments: [] }
  const separatedArguments = rawArgs.replace('>', '')
  const args = separatedArguments.split(',')

  return {
    name,
    arguments: args
  }
}

function parameterToAttribute (parameterNode: ParameterDeclaration, diagnostics: Diagnostic[]): Attribute | undefined {
  const name = parameterNode.getName()
  const type = parameterNode.getType()
  const attributeType = parseAttributeType(type.getText())

  const attributeBase: AttributeBase = {
    uid: crypto.randomUUID(),
    name
  }
  // title defaults to the parameter name; description and required are not
  // expressible in component code and are edited in the CMS afterwards
  const metaBase: MetaSchemaBase = {
    title: name,
    description: '',
    required: attributeType.arguments[1] === 'true'
  }

  switch (attributeType.name) {
    case 'BooleanAttribute': {
      const attribute: BooleanAttribute = {
        ...attributeBase,
        type: 'boolean',
        schema: {
          ...metaBase,
          type: 'boolean',
          default: attributeType.arguments[0] === 'true'
        }
      }
      return attribute
    }
    case 'NumberAttribute':
      return {
        ...attributeBase,
        type: 'number',
        schema: {
          ...metaBase,
          type: 'number',
          ...optional('minimum', optionalNumber(attributeType.arguments[0])),
          ...optional('maximum', optionalNumber(attributeType.arguments[1])),
          ...optional('multipleOf', optionalNumber(attributeType.arguments[2])),
          // display precision, which multipleOf does not express
          ...optional('decimalPlaces', optionalNumber(attributeType.arguments[3])),
          ...optional('default', optionalNumber(attributeType.arguments[4]))
        }
      }
    case 'StringAttribute':
      return {
        ...attributeBase,
        type: 'string',
        schema: {
          ...metaBase,
          type: 'string',
          ...optional('pattern', optionalString(attributeType.arguments[0])),
          ...optional('maxLength', optionalNumber(attributeType.arguments[1])),
          ...optional('default', optionalString(attributeType.arguments[2]))
        }
      }
    case 'TextAttribute':
      return {
        ...attributeBase,
        type: 'text',
        schema: {
          ...metaBase,
          type: 'string',
          ...optional('maxLength', optionalNumber(attributeType.arguments[0])),
          ...optional('default', optionalString(attributeType.arguments[1]))
        }
      }
    case 'MarkdownAttribute':
      return {
        ...attributeBase,
        type: 'markdown',
        schema: {
          ...metaBase,
          type: 'string',
          format: 'markdown',
          ...optional('default', optionalString(attributeType.arguments[0]))
        }
      }
    case 'RichTextAttribute':
      return {
        ...attributeBase,
        type: 'richText',
        schema: {
          ...metaBase,
          type: 'string',
          ...optional('default', optionalString(attributeType.arguments[0]))
        }
      }
    case 'LinkAttribute':
      return {
        ...attributeBase,
        type: 'link',
        schema: linksMetaSchema(metaBase)
      }
    case 'StorageResourceAttribute':
      return {
        ...attributeBase,
        type: 'storageResource',
        schema: storageResourcesMetaSchema(metaBase)
      }
    case 'ComponentsAttribute': {
      // The first argument named the accepted component and nothing read it;
      // items.enum carries that now.
      const allowedComponents = (optionalString(attributeType.arguments[2]) ?? '')
        .split('|')
        .filter((component) => component !== '')
      return {
        ...attributeBase,
        type: 'components',
        schema: {
          ...metaBase,
          type: 'array',
          items: {
            type: 'string',
            ...optional('enum', allowedComponents.length === 0 ? undefined : allowedComponents)
          },
          ...optional('maxItems', optionalNumber(attributeType.arguments[1]))
        }
      }
    }
    default: {
      // Reported rather than thrown: one unrecognized parameter should not cost the diagnostics
      // for every other parameter in the file, which is what an author needs to fix it.
      diagnostics.push({
        severity: 'fatal',
        rule: 'unknown-attribute-type',
        message: `Parameter '${name}' has type '${attributeType.name}', which is not an attribute type`,
        ...locate(parameterNode)
      })
      return undefined
    }
  }
}

function linksMetaSchema (metaBase: MetaSchemaBase): LinksMetaSchema {
  return {
    ...metaBase,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        isExternal: { type: 'boolean' },
        url: { type: ['string', 'null'] },
        pageName: { type: ['string', 'null'] }
      },
      required: ['isExternal']
    }
  }
}

function storageResourcesMetaSchema (metaBase: MetaSchemaBase): StorageResourcesMetaSchema {
  return {
    ...metaBase,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        bucket: { type: 'string' },
        name: { type: 'string' }
      },
      required: ['bucket', 'name']
    }
  }
}

/**
 * One attribute per parameter, keyed by **parameter name**.
 *
 * Not by uid, even though the type is keyed by a reference: a uid is identity the CMS assigns and
 * preserves across re-analysis, and this has no way to know which stored attribute a parameter
 * corresponds to. The uids written here are fresh, and the CMS replaces them for parameters that
 * survived.
 */
function functionArgumentsToAttributes (
  functionNode: FunctionDeclaration,
  diagnostics: Diagnostic[]
): ComponentHeaderAttributes {
  const attributes: ComponentHeaderAttributes = {}
  for (const parameter of functionNode.getParameters()) {
    const attribute = parameterToAttribute(parameter, diagnostics)
    if (!attribute) continue
    attributes[attribute.name] = attribute
  }
  return attributes
}

interface DerivationResult {
  attributes: ComponentHeaderAttributes
  diagnostics: Diagnostic[]
}

/**
 * Reads `source` and reports what the component named `entryFunction` accepts.
 *
 * The entry has to be **declared and exported**. Declared is what makes its parameters readable;
 * exported is what makes it reachable, because the artifact is an ES module and a consumer calls the
 * entry through the module's exports. An unexported entry analyzes, compiles and signs perfectly
 * well and then cannot be run by anybody — so it is refused here, while the author is editing, and
 * not left for a consumer to discover about an artifact that is already published and immutable.
 */
function deriveAttributes (source: string, entryFunction: string): DerivationResult {
  const diagnostics: Diagnostic[] = []
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('component.ts', source)
  const rootFunction = sourceFile.getFunction(entryFunction)

  if (!rootFunction) {
    diagnostics.push({
      severity: 'fatal',
      rule: 'missing-entry-function',
      message: `No function named '${entryFunction}' is declared in this component`
    })
    return { attributes: {}, diagnostics }
  }

  if (!rootFunction.isExported()) {
    diagnostics.push({
      severity: 'fatal',
      rule: 'entry-function-not-exported',
      message:
        `The function '${entryFunction}' is declared but not exported. A consumer reaches a ` +
        `component through its module's exports, so write 'export function ${entryFunction}'.`,
      ...locate(rootFunction)
    })
    return { attributes: {}, diagnostics }
  }

  return { attributes: functionArgumentsToAttributes(rootFunction, diagnostics), diagnostics }
}

export { deriveAttributes }
export type { DerivationResult }
