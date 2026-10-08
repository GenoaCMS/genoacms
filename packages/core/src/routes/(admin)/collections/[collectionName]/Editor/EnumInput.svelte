<script lang="ts">
  import type { InputValue } from '$lib/components/editors/types'
  import type { SchemaObject } from '$lib/script/schema'
  import { Combobox } from '$lib/components/ui/index'

  interface Props {
    schema: SchemaObject
    value: InputValue
    onvalue: (e: InputValue) => void
  }
  const { schema, value, onvalue }: Props = $props()

  const options: Array<string | number | boolean> = $derived(
    Array.isArray(schema.enum) ? (schema.enum as Array<string | number | boolean>) : []
  )

  const items = $derived(
    options.map(option => ({
      label: String(option),
      value: String(option)
    }))
  )

  const selected = $derived(
    value !== undefined && value !== null ? String(value) : ''
  )

  function castValue (raw: string): InputValue {
    const matched = options.find(option => String(option) === raw)
    if (matched !== undefined) {
      return matched
    }
    if (schema.type === 'number' || schema.type === 'integer') {
      const parsed = Number(raw)
      return isNaN(parsed) ? raw : parsed
    }
    if (schema.type === 'boolean') {
      return raw === 'true'
    }
    return raw
  }

  function handleSelect (next: string): void {
    if (next === '' && !options.includes('')) {
      onvalue(undefined)
      return
    }
    onvalue(castValue(next))
  }

  if (value === undefined && schema.default !== undefined) {
    onvalue(schema.default as InputValue)
  }
</script>

<Combobox
  {items}
  value={selected}
  onselect={handleSelect}
  placeholder="Select an option..."
/>
