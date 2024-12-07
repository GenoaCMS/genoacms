<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Button, ButtonGroup, Card, Label } from 'flowbite-svelte'
  import Input from './Input.svelte'
  import { extractProperties } from '../utils'

  type T = string | number | boolean | object
  export let name: string
  export let schema: JSONSchemaType<T>
  export let value = {}
  const discriminator = schema.discriminator?.propertyName || null
  let selectedSchema = pickUpSchemaFromValue()

  function selectSchema (index: number) {
    selectedSchema = index
  }
  function pickUpSchemaFromValue () {
    if (!discriminator) return 0
    const valueDiscriminator: string | undefined = value[discriminator]
    if (!valueDiscriminator) return 0
    const index = schema.oneOf.findIndex((item) => item.properties[discriminator].const === valueDiscriminator)
    return index === -1 ? 0 : index
  }

  $: objectSchema = discriminator ? schema.oneOf[selectedSchema] : schema
  $: properties = extractProperties(objectSchema.properties)
</script>

<Card class="w-full" size="none">
  {#if discriminator}
    <div class="w-full flex justify-center mt-3">
      <ButtonGroup>
        {#each schema.oneOf as item, index}
          <Button on:click={() => selectSchema(index)} color="blue">
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
      <Input name="{name}.{property.name}" {schema} bind:value={value[property.name]}/>
    </Label>
  {/each}
</Card>
