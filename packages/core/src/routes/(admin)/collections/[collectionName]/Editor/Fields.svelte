<script lang="ts">
  import type { SchemaObject } from '#lib/script/schema.js'
  import type { InputValue } from '#lib/components/editors/types.js'
  import Field from './Field.svelte'

  interface FieldDefinition {
    name: string
    schema: SchemaObject
  }
  interface Props {
    fields: Array<FieldDefinition>
    value: Record<string, InputValue>
    onfieldvalue: (name: string, value: InputValue) => void
  }
  const { fields, value, onfieldvalue }: Props = $props()
</script>

<div class="@container">
  <div class="grid grid-cols-1 @xl:grid-cols-2 gap-x-4 gap-y-5">
    {#each fields as field (field.name)}
      <Field
        name={field.name}
        schema={field.schema}
        value={value[field.name]}
        onvalue={(fieldValue) => onfieldvalue(field.name, fieldValue)}
      />
    {/each}
  </div>
</div>
