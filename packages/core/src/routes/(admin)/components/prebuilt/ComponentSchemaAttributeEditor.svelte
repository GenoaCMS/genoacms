<script lang="ts">
  import type { Attribute, AttributeType } from '$lib/script/components/componentEntry/component/types'
  import type { InputConfig } from '$lib/script/components/componentEntry/types'
  import {
    attributeToHTMLInputConfig,
    getAttributeSchemaByType,
    getAttributeTypes
  } from '$lib/script/components/componentEntry/entry'
  import Ajv, { type JSONSchemaType } from 'ajv'
  import { Button, Label, Select } from 'flowbite-svelte'
  import { createEventDispatcher } from 'svelte'

  export let attribute: Attribute | null = null
  const dispatch = createEventDispatcher()

  const attributeTypesToInputOptions = (types: Array<string>) => types.map((type) => ({
    name: type,
    value: type
  }))
  const getSchema = (attributeType: string) => {
    return getAttributeSchemaByType(attributeType)
  }
  const generateInputs = (schema: JSONSchemaType<Attribute>) => {
    inputs = Object.keys(schema.properties).filter(key => key !== 'type' && key !== 'uid').map((key) => {
      const isRequired = schema.required.includes(key) || false
      return attributeToHTMLInputConfig((key as AttributeType), schema.properties[key], isRequired)
    })
  }
  const saveAttribute = () => {
    if (!type) return
    const properties: Attribute | NonNullable<unknown> = {}

    for (const input of inputs) {
      properties[input.props.name] = input.value
    }
    const potentialAttribute: Attribute = {
      uid: crypto.randomUUID(),
      ...properties,
      type
    }
    const ajv = new Ajv()
    ajv.addSchema(schema)
    const isAttributeValid = ajv.validate(schema, potentialAttribute)
    if (!isAttributeValid) return
    attribute = potentialAttribute
    dispatch('save', attribute)
  }
  const loadValues = (attribute: Attribute) => {
    type = attribute.type
    for (const input of inputs) {
      input.value = attribute[input.props.name]
    }
  }

  const attributeTypes = getAttributeTypes()
  let type: AttributeType = attributeTypes[0]
  let schema: JSONSchemaType<Attribute> = getSchema(type)
  let inputs: Array<InputConfig<typeof schema.type>> = []

  $: schema = getSchema(type)
  $: generateInputs(schema)
  $: if (attribute) loadValues(attribute)
</script>

<form on:submit|preventDefault={saveAttribute}>
    <Label>
        Type
        <Select items={attributeTypesToInputOptions(attributeTypes)} bind:value={type} name="type"/>
    </Label>
    {#each inputs as Input (Input.label)}
        <Label>
            <span class="capitalize">{Input.label}</span>
            <Input.formControl bind:value={Input.value} {...Input.props}/>
        </Label>
    {/each}
    <Button type="submit" color="light" class="w-full mt-3">Save</Button>
</form>
