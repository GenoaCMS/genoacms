import type {
  Attribute,
  AttributeBase,
  BooleanAttribute,
  ComponentEntry,
  ComponentEntryAttributes,
  LinksMetaSchema,
  StorageResourcesMetaSchema
} from '../componentEntry/component/types'
import type { FunctionDeclaration, ParameterDeclaration } from 'ts-morph'

import { Project } from 'ts-morph'
import { ComponentCodeError } from './errors'

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

function parameterToAttribute (parameterNode: ParameterDeclaration): Attribute {
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
      throw new ComponentCodeError('invalid-attribute-type', `Invalid attribute type ${attributeType.name}`)
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

function functionArgumentsToAttributes (functionNode: FunctionDeclaration): ComponentEntryAttributes {
  const parameters = functionNode.getParameters()
  const attributes: ComponentEntryAttributes = {}
  for (const parameter of parameters) {
    const attribute = parameterToAttribute(parameter)
    attributes[attribute.name] = attribute
  }
  return attributes
}

function componentCodeToAttributes (functionName: string, code: string): ComponentEntryAttributes {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('temp.ts', code)
  const rootFunction = sourceFile.getFunction(functionName)
  if (!rootFunction) throw new ComponentCodeError('missing-root-function', `No root function named ${functionName} found in code`)
  const attributes = functionArgumentsToAttributes(rootFunction)
  return attributes
}

// Attributes need to be merged to preserve ID (in case they had one) to keep relations on page
function mergeAttributes (originalAttributes: ComponentEntryAttributes, newAttributes: ComponentEntryAttributes): ComponentEntryAttributes {
  const mergedAttributes: ComponentEntryAttributes = {}
  for (const attribute of Object.values(newAttributes)) {
    const originalAttribute = originalAttributes[attribute.name]
    if (!originalAttribute) {
      mergedAttributes[attribute.name] = attribute
      continue
    }
    mergedAttributes[attribute.name] = {
      ...attribute,
      uid: originalAttribute.uid
    }
  }
  return mergedAttributes
}

function componentCodeToEntry (functionName: string, code: string, componentEntry: ComponentEntry): ComponentEntry {
  const attributes = componentCodeToAttributes(functionName, code)
  const mergedAttributes = mergeAttributes(componentEntry.attributes, attributes)
  componentEntry.attributes = mergedAttributes
  return componentEntry
}

export {
  componentCodeToEntry
}
