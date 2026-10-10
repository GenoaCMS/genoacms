<script lang="ts" generics="T extends object">
  import type { CollectionReference } from '@genoacms/contracts/database'
  import type { InputValue } from '$lib/components/editors/types'
  import { asSchemaObject } from '$lib/script/schema'
  import { extractDocumentProperties } from '../utils'
  import Fields from './Fields.svelte'

  interface Props {
    collectionReference: CollectionReference;
    value?: T,
    onvalue?: (value: T) => T
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
