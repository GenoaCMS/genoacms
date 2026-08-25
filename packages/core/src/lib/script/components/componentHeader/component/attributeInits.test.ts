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
  componentHeaderSchema
} from './schemas'
import type { Json, Schema } from '@exodus/schemasafe'
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
  return { uid: 'test-uid', name: 'test-uid', type, schema }
}

/** everything is JSON-serialized before validation and storage */
function roundTrip (value: unknown): Json {
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

  // Regression guard, since inverted. An unset constraint must be *absent*:
  // JCS({"minimum": null}) and JCS({}) are different byte streams, so admitting
  // both shapes would mean two entries meaning the same thing sign differently.
  it.each(attributeTypeInits)(
    'a new $name attribute names no unset constraint at all',
    ({ schema }) => {
      const unset = ['minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems']
      expect(Object.keys(roundTrip(schema) as object).filter(key => unset.includes(key))).toEqual([])
    }
  )

  it('rejects a number attribute whose unset fields are null', () => {
    const validate = validator(numberAttributeSchema)
    const withNulls = buildAttribute('number', {
      type: 'number',
      title: 'MustNum',
      description: '',
      minimum: -2,
      maximum: 3,
      multipleOf: null,
      required: false,
      default: null
    })
    // Proves the boundary really refuses null, rather than the inits merely
    // happening not to write one. Without this the rule would rest on habit.
    expect(validate(roundTrip(withNulls))).toBe(false)
  })

  it('rejects an attribute carrying a flat sibling the schema already expresses', () => {
    // The other half of the rule: one place per fact. additionalProperties: false is
    // what stops a producer quietly reintroducing the duplication.
    const validate = validator(componentsAttributeSchema)
    const withSibling = {
      ...buildAttribute('components', {
        type: 'array', title: 't', description: '', items: { type: 'string' }, required: false
      }),
      maxComponents: 3
    }
    expect(validate(roundTrip(withSibling))).toBe(false)
  })
})

describe('component entry', () => {
  it('validates an entry containing one of every attribute type', () => {
    const validate = validator(componentHeaderSchema)
    const attributes = Object.fromEntries(
      attributeTypeInits.map(({ name, schema }) => [name, buildAttribute(name, schema)])
    )
    const entry = {
      uid: 'entry-uid',
      name: 'August10Test',
      type: 'prebuilt' as ComponentType,
      attributes,
      attributeOrder: Object.keys(attributes)
    }
    expect(validate(roundTrip(entry))).toBe(true)
  })

  it('rejects an entry still carrying an editing history', () => {
    // Editing history moved into UndoRedoEnvelope, and an entry is now only what describes a
    // component — which is what makes it publishable and signable. Asserted rather than assumed,
    // because additionalProperties: false is the only thing enforcing it and a schema is easy to
    // relax by accident.
    const validate = validator(componentHeaderSchema)
    const entry = {
      uid: 'entry-uid',
      name: 'August10Test',
      type: 'prebuilt' as ComponentType,
      attributes: {},
      attributeOrder: [],
      history: [],
      future: []
    }
    expect(validate(roundTrip(entry))).toBe(false)
  })
})
