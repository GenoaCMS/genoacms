<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Button, ButtonGroup, Card, Label } from 'flowbite-svelte'
  import Input from './Input.svelte'
  import { extractProperties } from '../utils'

  type T = string | number | boolean | object
  type Props = {
    name: string
    schema: JSONSchemaType<T>
    value: T
  }
  let { name, schema, value = $bindable() }: Props = $props()
  const discriminator = $derived(schema.discriminator?.propertyName || null)
  let v = $state(value || {})
  let selectedSchema = $state(pickUpSchemaFromValue())
  const objectSchema = $derived(discriminator ? schema.oneOf[selectedSchema] : schema)
  const properties = $derived(extractProperties(objectSchema.properties))

  function selectSchema (index: number) {
    selectedSchema = index
    v = removeOldProperties(v)
  }
  function pickUpSchemaFromValue () {
    if (!discriminator) return 0
    const valueDiscriminator: string | undefined = v[discriminator]
    if (!valueDiscriminator) return 0
    const index = schema.oneOf.findIndex((item) => item.properties[discriminator].const === valueDiscriminator)
    return index === -1 ? 0 : index
  }
  function removeOldProperties (v: T): T {
    if (typeof v !== 'object') return v
    for (const key in v) {
      if (!properties.find((property) => property.name === key)) {
        delete v[key]
      }
    }
    return v
  }
  function updateValue (name: string, value: T) {
    v[name] = value
    value = v
  }
</script>

<Card class="w-full" size="none">
  {#if discriminator}
    <div class="w-full flex justify-center mt-3">
      <ButtonGroup>
        {#each schema.oneOf as item, index}
          <Button onclick={() => selectSchema(index)} color="blue" outline={index !== selectedSchema}>
            {item.properties[discriminator].const}
          </Button>
        {/each}
      </ButtonGroup>
    </div>
  {/if}

  {#each properties as property (objectSchema.properties[property.name])}
    {@const schema = objectSchema.properties[property.name]}
    <Label>
      {property.name}:
      <Input name="{name}.{property.name}" {schema} value={v[property.name]} onvalue={(v) => updateValue(property.name, v)}/>
    </Label>
  {/each}
</Card>
