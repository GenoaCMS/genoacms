import { describe, it, expect } from 'vitest'
import { validator } from '@exodus/schemasafe'
import { attributeTypeInits } from './attributeInits'
import {
  booleanAttributeSchema,
  numberAttributeSchema,
  stringAttributeSchema,
  textAttributeSchema,
  markdownAttributeSchema,
  richTextAttributeSchema,
  linkAttributeSchema,
  storageResourceAttributeSchema,
  componentsAttributeSchema,
  componentEntrySchema
} from './schemas'
import type { Schema } from '@exodus/schemasafe'
import type { AttributeType, ComponentType } from './types'

const attributeSchemaByType: Record<AttributeType, Schema> = {
  boolean: booleanAttributeSchema,
  number: numberAttributeSchema,
  string: stringAttributeSchema,
  text: textAttributeSchema,
  markdown: markdownAttributeSchema,
  richText: richTextAttributeSchema,
  link: linkAttributeSchema,
  storageResource: storageResourceAttributeSchema,
  components: componentsAttributeSchema
}

/** what AddAttribute.add() hands to onadd */
function buildAttribute (type: AttributeType, schema: object) {
  return { uid: 'test-uid', type, schema }
}

/** everything is JSON-serialised before validation and storage */
function roundTrip<T> (value: T): T {
  return JSON.parse(JSON.stringify(value))
}

describe('attribute inits', () => {
  it.each(attributeTypeInits)(
    'a new $name attribute validates against its schema after a JSON round-trip',
    ({ name, schema }) => {
      const validate = validator(attributeSchemaByType[name])
      expect(validate(roundTrip(buildAttribute(name, schema)))).toBe(true)
    }
  )

  // Regression guard. Unset numeric constraints must be null rather than
  // undefined: JSON.stringify drops undefined keys, and the meta-schemas list
  // several of those keys as required, so the attribute silently fails
  // validation on save with "Invalid data".
  it.each(attributeTypeInits)(
    'a new $name attribute keeps every key through JSON serialisation',
    ({ schema }) => {
      expect(Object.keys(roundTrip(schema))).toEqual(Object.keys(schema))
    }
  )

  it('rejects a number attribute whose unset fields are undefined', () => {
    const validate = validator(numberAttributeSchema)
    const withUndefined = buildAttribute('number', {
      type: 'number',
      title: 'MustNum',
      description: '',
      minimum: -2,
      maximum: 3,
      multipleOf: undefined,
      required: false,
      default: undefined
    })
    // proves the failure mode is real rather than hypothetical
    expect(validate(roundTrip(withUndefined))).toBe(false)
  })
})

describe('component entry', () => {
  it('validates an entry containing one of every attribute type', () => {
    const validate = validator(componentEntrySchema)
    const attributes = Object.fromEntries(
      attributeTypeInits.map(({ name, schema }) => [name, buildAttribute(name, schema)])
    )
    const entry = {
      uid: 'entry-uid',
      name: 'August10Test',
      type: 'prebuilt' as ComponentType,
      attributes,
      attributeOrder: Object.keys(attributes),
      history: [],
      future: []
    }
    expect(validate(roundTrip(entry))).toBe(true)
  })
})
