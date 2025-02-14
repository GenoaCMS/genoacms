import type { Attribute, AttributeBase, BooleanAttribute, ComponentEntry, ComponentEntryAttributes } from '../componentEntry/component/types'
import type { FunctionDeclaration, ParameterDeclaration } from 'ts-morph'

import { Project } from 'ts-morph'
import { ComponentCodeError } from './errors'

interface AttributeCodeType {
  name: string
  arguments: Array<string>
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
    name,
    description: '',
    isRequired: attributeType.arguments[1] === 'true'
  }
  switch (attributeType.name) {
    case 'BooleanAttribute': {
      const attribute: BooleanAttribute = {
        ...attributeBase,
        type: 'boolean',
        defaultValue: attributeType.arguments[0] === 'true'
      }
      return attribute
    }
    case 'NumberAttribute':
      return {
        ...attributeBase,
        type: 'number',
        min: parseFloat(attributeType.arguments[0]),
        max: parseFloat(attributeType.arguments[1]),
        step: parseFloat(attributeType.arguments[2]),
        decimalPlaces: parseFloat(attributeType.arguments[3]),
        defaultValue: parseFloat(attributeType.arguments[4])
      }
    case 'StringAttribute':
      return {
        ...attributeBase,
        type: 'string',
        regex: attributeType.arguments[0],
        maxLength: parseFloat(attributeType.arguments[1]),
        defaultValue: attributeType.arguments[2]
      }
    case 'TextAttribute':
      return {
        ...attributeBase,
        type: 'text',
        maxLength: parseFloat(attributeType.arguments[0]),
        defaultValue: attributeType.arguments[1]
      }
    case 'MarkdownAttribute':
      return {
        ...attributeBase,
        type: 'markdown',
        defaultValue: attributeType.arguments[0]
      }
    case 'RichTextAttribute':
      return {
        ...attributeBase,
        type: 'richText',
        defaultValue: attributeType.arguments[0]
      }
    case 'LinkAttribute':
      return {
        ...attributeBase,
        type: 'link'
      }
    case 'StorageResourceAttribute':
      return {
        ...attributeBase,
        type: 'storageResource'
      }
    case 'ComponentsAttribute':
      return {
        ...attributeBase,
        type: 'components',
        component: attributeType.arguments[0],
        maxComponents: parseInt(attributeType.arguments[1]),
        allowedComponents: attributeType.arguments[2].split('|')
      }
    default: {
      throw new ComponentCodeError('invalid-attribute-type', `Invalid attribute type ${attributeType.name}`)
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
