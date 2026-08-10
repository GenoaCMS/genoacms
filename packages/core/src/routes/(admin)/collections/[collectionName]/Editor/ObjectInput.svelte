<script lang="ts">
  import type { ObjectValue } from './types'
  import { asSchemaObject, type SchemaObject } from '$lib/script/schema'
  import {
    Button,
    ButtonGroup,
    Card,
    Dropdown,
    Label,
  } from '$lib/components/ui/index'
  import Input from './Input.svelte'
  import { extractProperties } from '../utils'
  import { dragHandle } from 'svelte-dnd-action'

  interface Props {
    schema: SchemaObject
    value: ObjectValue
    onvalue: (e: ObjectValue) => void
    ondelete: () => void
  }

  let { schema, value = {}, onvalue, ondelete }: Props = $props()
  const discriminator = $derived(schema.discriminator?.propertyName || null)
  // a discriminated schema lists its alternatives under oneOf
  const variants = $derived(
    (schema.oneOf ?? [])
      .map(asSchemaObject)
      .filter((variant) => variant !== undefined)
  )
  let selectedSchema = $state(pickUpSchemaFromValue())
  const objectSchema = $derived(
    discriminator ? variants[selectedSchema] ?? schema : schema
  )
  const properties = $derived(extractProperties(objectSchema))

  function selectSchema (index: number) {
    selectedSchema = index
    value = removeOldProperties(value)
    onvalue(value)
  }
  function pickUpSchemaFromValue () {
    if (!discriminator) return 0
    const valueDiscriminator: string | undefined = value[discriminator]
    if (!valueDiscriminator) return 0
    const index = variants.findIndex(
      (variant) =>
        asSchemaObject(variant.properties?.[discriminator])?.const ===
        valueDiscriminator
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
          {#each variants as variant, index}
            <Button
              onclick={() => selectSchema(index)}
              color="blue"
              outline={index !== selectedSchema}
            >
              {asSchemaObject(variant.properties?.[discriminator])?.const}
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

  {#each properties as property (property.name)}
    {@const schema = asSchemaObject(objectSchema.properties?.[property.name])}
    {#if schema}
      <Label>
        {property.name}:
        <Input
          {schema}
          value={value[property.name]}
          onvalue={(v) => updateValue(property.name, v)}
        />
      </Label>
    {/if}
  {/each}
</Card>
