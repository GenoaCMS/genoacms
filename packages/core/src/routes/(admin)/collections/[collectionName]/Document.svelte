<script lang="ts">
  import { extractProperties } from './utils'
  import type { DocumentReference } from '@genoacms/cloudabstraction/dist/services/database/index.d.ts'

  export let reference: DocumentReference
  export let data
  const schema = reference.collection.schema
  const properties = extractProperties(schema.properties)
</script>

<a href="{reference.collection.name}/{reference.id}">
  <div class="flex">
    {#each properties as property}
      <div class="flex-grow w-full text-center py-2 border-b-2 border-light">
        {data[property.name]}
      </div>
    {/each}
  </div>
</a>
