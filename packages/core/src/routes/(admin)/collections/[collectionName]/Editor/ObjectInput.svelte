<script lang="ts">
  import type { ObjectValue } from './types'
  import type { JSONSchemaType } from 'ajv'
  import { Button, ButtonGroup, Card, Dropdown, Label, } from '$lib/components/ui/index'
  import Input from './Input.svelte'
  import { extractProperties } from '../utils'
  import { dragHandle } from 'svelte-dnd-action'

  interface Props {
    schema: JSONSchemaType<ObjectValue>
    value: ObjectValue
    onvalue: (e: ObjectValue) => void
    ondelete: () => void
  }

  let { schema, value = {}, onvalue, ondelete }: Props = $props()
  const discriminator = $derived(schema.discriminator?.propertyName || null)
  let selectedSchema = $state(pickUpSchemaFromValue())
  const objectSchema = $derived(
    discriminator ? schema.oneOf[selectedSchema] : schema
  )
  const properties = $derived(extractProperties(objectSchema.properties))

  function selectSchema (index: number) {
    selectedSchema = index
    value = removeOldProperties(value)
    onvalue(value)
  }
  function pickUpSchemaFromValue () {
    if (!discriminator) return 0
    const valueDiscriminator: string | undefined = value[discriminator]
    if (!valueDiscriminator) return 0
    const index = schema.oneOf.findIndex(
      (item: any) =>
        item.properties[discriminator].const === valueDiscriminator
    )
    return index === -1 ? 0 : index
  }
  function removeOldProperties (v: ObjectValue): ObjectValue {
    if (typeof v !== 'object') return v
    for (const key in v) {
      if (!properties.find((property) => property.name === key)) {
        delete v[key]
      }
    }
    return v
  }
  function updateValue (name: string, newVal: ObjectValue) {
    value[name] = newVal
    onvalue(value)
  }
</script>

<Card class="w-full p-4 sm:p-6" size="xl">
  <div class="w-full flex">
    <div class="flex">
      <button aria-label="Dragger" type="button" use:dragHandle>
        <i class="bi bi-arrow-down-up text-2xl m-auto"></i>
      </button>
    </div>
    <div class="m-auto">
      {#if discriminator}
        <ButtonGroup>
          {#each schema.oneOf as item, index}
            <Button
              onclick={() => selectSchema(index)}
              color="blue"
              outline={index !== selectedSchema}
            >
              {item.properties[discriminator].const}
            </Button>
          {/each}
        </ButtonGroup>
      {/if}
    </div>
    <div class="flex">
      <Dropdown>
        <Button preset="filled" class="!bg-error-500 flex" onclick={ondelete}>
          <span>Delete</span>
          <i class="bi bi-trash ms-2"></i>
        </Button>
      </Dropdown>
    </div>
  </div>

  {#each properties as property (objectSchema.properties[property.name])}
    {@const schema = objectSchema.properties[property.name]}
    <Label>
      {property.name}:
      <Input
        {schema}
        value={value[property.name]}
        onvalue={(v) => updateValue(property.name, v)}
      />
    </Label>
  {/each}
</Card>
