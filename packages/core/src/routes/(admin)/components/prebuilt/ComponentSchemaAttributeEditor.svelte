<script lang="ts">
  import type { attributeValue, InputConfig } from '$lib/script/components/componentEntry/types'
  import {
    attributeToHTMLInputConfig,
    getAttributeSchemaByType,
    getAttributeTypes
  } from '$lib/script/components/componentEntry/entry'
  import Ajv, { type JSONSchemaType } from 'ajv'
  import { Button, Label, Select } from 'flowbite-svelte'
  import { createEventDispatcher } from 'svelte'

  export let attribute: attributeValue | null = null
  const dispatch = createEventDispatcher()

  const attributeTypesToInputOptions = (types: Array<string>) => types.map((type) => ({
    name: type,
    value: type
  }))
  const getSchema = (attributeType: string) => {
    return getAttributeSchemaByType(attributeType)
  }
  const generateInputs = (schema: JSONSchemaType<attributeValue>) => {
    inputs = Object.keys(schema.properties).filter(key => key !== 'type').map((key) => {
      const isRequired = schema.required.includes(key) || false
      return attributeToHTMLInputConfig((key as attributeValue['type']), schema.properties[key], isRequired)
    })
  }
  const saveAttribute = () => {
    if (!type) return
    type currentAttribute = Extract<attributeValue, { type: typeof type }>
    let properties: Omit<currentAttribute, 'type'> = {}

    for (const input of inputs) {
      properties[input.props.name] = input.value
    }
    const potentialAttribute: currentAttribute = {
      type,
      ...properties
    }
    const ajv = new Ajv()
    ajv.addSchema(schema)
    const isAttributeValid = ajv.validate(schema, potentialAttribute)
    if (!isAttributeValid) return
    attribute = potentialAttribute
    dispatch('save', attribute)
  }
  const loadValues = (attribute: attributeValue) => {
    type = attribute.type
    for (const input of inputs) {
      input.value = attribute[input.props.name]
    }
  }

  const attributeTypes = getAttributeTypes()
  let type: attributeValue['type'] = attributeTypes[0]
  let schema: JSONSchemaType<attributeValue> = getSchema(type)
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
