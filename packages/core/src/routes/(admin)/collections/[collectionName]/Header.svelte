<script lang="ts">
  import { extractProperties } from './utils'
  export let schema
  const properties = extractProperties(schema.properties)
</script>

<div class="bg-light text-center flex border-b border-s border-dark">
    {#each properties as property}
        <div class="flex-grow w-full text-center">
            {property.name}
        </div>
    {/each}
</div>
