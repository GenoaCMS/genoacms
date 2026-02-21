<script lang="ts">
  import type { ObjectValue, Constraints, Errors } from './types'
  import type { JSONSchemaType } from 'ajv'
  import { Button, ButtonGroup, Card, Dropdown, Label } from 'flowbite-svelte'
  import Input from './Input.svelte'
  import { extractProperties } from '../utils'
  import { dragHandle } from 'svelte-dnd-action'

  type Props = {
    schema: JSONSchemaType<ObjectValue>
    value: ObjectValue,
    constraints: Constraints,
    errors: Errors,
    onvalue: (e: ObjectValue) => void,
    ondelete: () => void
  }

  const { schema, value, constraints, errors, onvalue, ondelete }: Props = $props()
  const discriminator = $derived(schema.discriminator?.propertyName || null)
  let v: ObjectValue = $state(value || {})
  let selectedSchema = $state(pickUpSchemaFromValue())
  const objectSchema = $derived(discriminator ? schema.oneOf[selectedSchema] : schema)
  const properties = $derived(extractProperties(objectSchema.properties))
  let isDropdownOpen = $state(false)

  function toggleDropdown () {
    isDropdownOpen = !isDropdownOpen
  }
  function selectSchema (index: number) {
    selectedSchema = index
    v = removeOldProperties(v)
    onvalue(v)
  }
  function pickUpSchemaFromValue () {
    if (!discriminator) return 0
    const valueDiscriminator: string | undefined = v[discriminator]
    if (!valueDiscriminator) return 0
    const index = schema.oneOf.findIndex((item) => item.properties[discriminator].const === valueDiscriminator)
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
  function updateValue (name: string, value: ObjectValue) {
    v[name] = value
    onvalue(v)
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
            <Button onclick={() => selectSchema(index)} color="blue" outline={index !== selectedSchema}>
              {item.properties[discriminator].const}
            </Button>
          {/each}
        </ButtonGroup>
      {/if}
    </div>
    <div class="flex">
      <Button color="none" onclick={toggleDropdown}>
        <i class="bi bi-three-dots-vertical text-2xl m-auto"></i>
      </Button>
      <Dropdown open={isDropdownOpen}>
        <Button color="red" class="flex" onclick={ondelete}>
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
      <Input {schema}
        value={v[property.name]}
        constraints={constraints?.[property.name]}
        errors={errors?.[property.name]}
        onvalue={(v) => updateValue(property.name, v)}/>
    </Label>
  {/each}
</Card>
