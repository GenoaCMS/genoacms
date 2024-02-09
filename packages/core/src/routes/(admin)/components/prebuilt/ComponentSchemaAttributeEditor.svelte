<script lang="ts">
  import type { attributeValue, InputConfig } from '$lib/script/components/types'
  import {
    attributeToHTMLInputConfig,
    getAttributeSchemaByType,
    getAttributeTypes
  } from '$lib/script/components/schemas'
  import Ajv, { type JSONSchemaType } from 'ajv'
  import { Label, Select } from 'flowbite-svelte'
  import Button from '$lib/components/Button.svelte'

  export let attribute: attributeValue | null

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
      return attributeToHTMLInputConfig(key, schema.properties[key], isRequired)
    })
  }
  const createAttribute = (event: SubmitEvent) => {
    if (!type) return
    const properties = {}
    for (const input of inputs) {
      properties[input.props.name] = input.value
    }
    type currentAttribute<T extends attributeValue> = typeof type extends T['type'] ? T : never
    const potentialAttribute: currentAttribute<attributeValue> = {
      type,
      ...properties
    }
    const ajv = new Ajv()
    ajv.addSchema(schema)
    const isAttributeValid = ajv.validate(schema, potentialAttribute)
    if (!isAttributeValid) return
    attribute = potentialAttribute
  }

  const attributeTypes = getAttributeTypes()
  let type: attributeValue['type'] = attributeTypes[0]
  let schema: JSONSchemaType<attributeValue> = getSchema(type)
  let inputs: Array<InputConfig<typeof schema>> = []

  $: schema = getSchema(type)
  $: generateInputs(schema)
  $: console.log({ inputs })
</script>

<form on:submit|preventDefault={createAttribute}>
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
    <Button class="w-full mt-3" type="submit">Create</Button>
</form>
