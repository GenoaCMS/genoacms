<script lang="ts" generics="T extends object">
  import type { CollectionReference } from '@genoacms/cloudabstraction/database'
  import { extractProperties } from '../utils'
  import Prop from './Prop.svelte'

  interface Props {
    collectionReference: CollectionReference;
    value?: T,
    onvalue?: (value: T) => T
  }
  const { collectionReference, value = {}, onvalue }: Props = $props()
  const properties = $derived(extractProperties(collectionReference))

  function updateProperty (name: string, propValue: unknown) {
    value[name] = propValue
    onvalue(value)
  }
</script>

<div class="">
  {#each properties as property (property.name)}
    <Prop
      name={property.name}
      schema={collectionReference.schema.properties[property.name]}
      value={value[property.name]}
      onvalue={(value) => updateProperty(property.name, value)}
    />
  {/each}
</div>
