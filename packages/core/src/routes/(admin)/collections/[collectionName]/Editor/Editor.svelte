<script lang="ts">
  import type { CollectionReference } from '@genoacms/contracts/database'
  import type { InputValue } from '#lib/components/editors/types.js'
  import { asSchemaObject } from '#lib/script/schema.js'
  import { extractDocumentProperties } from '../utils'
  import Fields from './Fields.svelte'

  interface Props {
    collectionReference: CollectionReference;
    value?: Record<string, unknown>,
    onvalue: (value: Record<string, unknown>) => unknown
  }
  const { collectionReference, value = {}, onvalue }: Props = $props()
  const fields = $derived(
    extractDocumentProperties(collectionReference).flatMap((property) => {
      const schema = asSchemaObject(collectionReference.schema.properties?.[property.name])
      return schema ? [{ name: property.name, schema }] : []
    })
  )

  function updateProperty (name: string, propValue: InputValue) {
    value[name] = propValue
    onvalue(value)
  }
</script>

<Fields {fields} value={value as Record<string, InputValue>} onfieldvalue={updateProperty} />
