<script lang="ts">
  import type { CollectionReference, DocumentReference } from '@genoacms/cloudabstraction/database'
  import { extractProperties } from './utils'
  import Selectable from './Selectable.svelte'

  export let reference: DocumentReference<CollectionReference>
  export let data
  const schema = reference.collection.schema
  const properties = extractProperties(schema.properties)
</script>

<Selectable id={reference.id}>
  <a href="{reference.collection.name}/{reference.id}">
    <div class="flex">
      {#each properties as property}
        <div class="flex-grow w-full text-center py-2 border-b-2 border-light">
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
