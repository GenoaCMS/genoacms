<script lang="ts">
  import type { CollectionReference, DocumentReference } from '@genoacms/cloudabstraction/database'
  import { extractProperties } from './utils'
  import Selectable from './Selectable.svelte'

  interface Props {
    reference: DocumentReference<CollectionReference>
    data
  }
  const { reference, data }: Props = $props()
  const properties = extractProperties(reference.collection, { preview: true })
</script>

<Selectable id={reference.id}>
  <a href="{reference.collection.name}/{reference.id}">
    <div class="flex">
      {#each properties as property (property.name)}
        <div class="flex-grow w-full text-start py-2 border-b-2 border-light px-4">
          {#if property.type === 'array'}
            {(data[property.name] || []).length} items
          {:else}
            {data[property.name] || ''}
          {/if}
        </div>
      {/each}
    </div>
  </a>
</Selectable>
