import type { JSONSchemaType } from 'ajv'

function parseDocument (formData: FormData, schema: JSONSchemaType<any>): object {
  const documentData = {}
  for (const property in schema.properties) {
    const type = schema.properties[property].type
    const value = formData.get(property)
    if (!value) continue
    let parsedValue: number | boolean | string
    if (type === 'number') parsedValue = Number(value)
    else if (type === 'boolean') parsedValue = Boolean(value)
    else if (type === 'array' && typeof value === 'string') parsedValue = JSON.parse(value)
    else parsedValue = value as string
    documentData[property] = parsedValue
  }
  return documentData
}

export { parseDocument }
