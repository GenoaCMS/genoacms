<script lang="ts">
  import type { InputValue, ObjectValue } from '$lib/components/editors/types'
  import { asSchemaObject, type SchemaObject } from '$lib/script/schema'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import Fields from './Fields.svelte'
  import { extractProperties } from '../utils'

  interface Props {
    schema: SchemaObject
    value: ObjectValue
    onvalue: (e: ObjectValue) => void
  }

  let { schema, value = {}, onvalue }: Props = $props()
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
  const fields = $derived(
    properties.flatMap((property) => {
      const propertySchema = asSchemaObject(objectSchema.properties?.[property.name])
      return propertySchema ? [{ name: property.name, schema: propertySchema }] : []
    })
  )

  function variantName (variant: SchemaObject, index: number): string {
    if (!discriminator) return String(index)
    const constVal = asSchemaObject(variant.properties?.[discriminator])?.const
    return constVal !== undefined ? String(constVal) : String(index)
  }

  const selectedSegment = $derived(
    variants[selectedSchema] ? variantName(variants[selectedSchema], selectedSchema) : ''
  )

  $effect(() => {
    const nextIndex = pickUpSchemaFromValue()
    if (nextIndex !== selectedSchema) {
      selectedSchema = nextIndex
    }
  })

  function selectSchema (index: number) {
    selectedSchema = index
    const nextSchema = discriminator ? variants[index] ?? schema : schema
    const nextProperties = extractProperties(nextSchema)
    value = removeOldProperties(value, nextProperties)
    if (discriminator) {
      const constVal = asSchemaObject(variants[index]?.properties?.[discriminator])?.const
      if (constVal !== undefined) {
        value[discriminator] = constVal
      }
    }
    onvalue(value)
  }

  function handleSegmentChange (segmentValue: string | null) {
    if (!segmentValue) return
    const index = variants.findIndex((variant, i) => variantName(variant, i) === segmentValue)
    if (index !== -1) {
      selectSchema(index)
    }
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

  function removeOldProperties (v: ObjectValue, allowedProps = properties): ObjectValue {
    if (typeof v !== 'object') return v
    for (const key in v) {
      if (!allowedProps.find((property) => property.name === key)) {
        delete v[key]
      }
    }
    return v
  }

  function updateValue (name: string, newVal: InputValue) {
    value[name] = newVal
    onvalue(value)
  }
</script>

<div class="flex flex-col gap-4">
  {#if discriminator}
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm text-surface-600-400">Variant</span>
      <SegmentedControl
        value={selectedSegment}
        onValueChange={(e) => handleSegmentChange(e.value)}
      >
        <SegmentedControl.Control>
          <SegmentedControl.Indicator />
          {#each variants as variant, index}
            {@const itemValue = variantName(variant, index)}
            <SegmentedControl.Item value={itemValue}>
              <SegmentedControl.ItemText>{itemValue}</SegmentedControl.ItemText>
              <SegmentedControl.ItemHiddenInput />
            </SegmentedControl.Item>
          {/each}
        </SegmentedControl.Control>
      </SegmentedControl>
    </div>
  {/if}

  <Fields {fields} {value} onfieldvalue={updateValue} />
</div>
