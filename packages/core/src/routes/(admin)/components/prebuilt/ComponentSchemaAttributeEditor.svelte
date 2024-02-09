<script lang="ts">
  import type { attributeValue, InputConfig } from '$lib/script/components/types'
  import {
    attributeToHTMLInputConfig,
    getAttributeSchemaByType,
    getAttributeTypes
  } from '$lib/script/components/schemas'
  import type { JSONSchemaType } from 'ajv'
  import { Label, Select } from 'flowbite-svelte'

  export let attribute: attributeValue | null
  const attributeTypes = getAttributeTypes()
  let type: string | null = attributeTypes[0]
  let schema: JSONSchemaType<attributeValue> | null = null
  let inputs: Array<InputConfig> = []

  const attributeTypesToInputOptions = (types: Array<string>) => types.map((type) => ({
    name: type,
    value: type
  }))
  const getSchema = (attributeType: string | null) => {
    if (!attributeType) return null
    return getAttributeSchemaByType(attributeType)
  }
  const generateInputs = (schema: JSONSchemaType<attributeValue> | null) => {
    if (!schema) return []
    return Object.keys(schema.properties).filter(key => key !== 'type').map((key) => {
      const isRequired = schema.required?.includes(key) || false
      return attributeToHTMLInputConfig(key, schema.properties[key], isRequired)
    })
  }

  $: schema = getSchema(type)
  $: inputs = generateInputs(schema)
  $: console.log({ inputs })
</script>

<Label>
    Type
    <Select items={attributeTypesToInputOptions(attributeTypes)} bind:value={type}/>
</Label>
{#each inputs as Input}
    <Label>
        <span class="capitalize">{Input.label}</span>
        <Input.formControl {...Input.props}/>
    </Label>
{/each}
