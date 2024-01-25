<script lang="ts">
  import { extractProperties } from './utils'
  import type { CollectionReference } from '@genoacms/cloudabstraction/dist/services/database/index.d.ts'
  import Input from '$lib/components/Input.svelte'

  export let reference: CollectionReference
  export let data
  const schema = reference.collection.schema
  const properties = extractProperties(schema.properties)
</script>

<div class="flex">
  {#each properties as property}
    <div class="m-auto">
      <Input bind:value={data[property.name]} placeholder={property.name}/>
    </div>
  {/each}
</div>
