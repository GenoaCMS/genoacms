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
 * may be absent. "Not set" is null rather than undefined because these objects
 * are JSON-serialised before being validated and stored, and JSON.stringify
 * drops undefined keys — which would fail the required fields in
 * componentEntrySchema.
 */
function optionalNumber (raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? null : parsed
}

function optionalString (raw: string | undefined): string {
  return raw?.trim() ?? ''
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
        decimalPlaces: optionalNumber(attributeType.arguments[3]) ?? 0,
        schema: {
          ...metaBase,
          type: 'number',
          minimum: optionalNumber(attributeType.arguments[0]),
          maximum: optionalNumber(attributeType.arguments[1]),
          multipleOf: optionalNumber(attributeType.arguments[2]),
          default: optionalNumber(attributeType.arguments[4])
        }
      }
    case 'StringAttribute':
      return {
        ...attributeBase,
        type: 'string',
        schema: {
          ...metaBase,
          type: 'string',
          pattern: optionalString(attributeType.arguments[0]),
          maxLength: optionalNumber(attributeType.arguments[1]),
          default: optionalString(attributeType.arguments[2])
        }
      }
    case 'TextAttribute':
      return {
        ...attributeBase,
        type: 'text',
        schema: {
          ...metaBase,
          type: 'string',
          maxLength: optionalNumber(attributeType.arguments[0]),
          default: optionalString(attributeType.arguments[1])
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
          default: optionalString(attributeType.arguments[0])
        }
      }
    case 'RichTextAttribute':
      return {
        ...attributeBase,
        type: 'richText',
        schema: {
          ...metaBase,
          type: 'string',
          default: optionalString(attributeType.arguments[0])
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
      const allowedComponents = optionalString(attributeType.arguments[2])
        .split('|')
        .filter((component) => component !== '')
      return {
        ...attributeBase,
        type: 'components',
        component: optionalString(attributeType.arguments[0]),
        maxComponents: optionalNumber(attributeType.arguments[1]) ?? 0,
        allowedComponents,
        schema: {
          ...metaBase,
          type: 'array',
          items: { type: 'string', enum: allowedComponents },
          maxItems: optionalNumber(attributeType.arguments[1])
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
