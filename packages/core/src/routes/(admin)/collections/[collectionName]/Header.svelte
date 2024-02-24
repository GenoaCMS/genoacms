<script lang="ts">
  import { extractProperties } from './utils'
  export let schema
  const properties = extractProperties(schema.properties)
</script>

<div class="bg-light dark:bg-dark-light text-center flex border-b border-s border-dark dark:border-light">
    {#each properties as property}
        <div class="flex-grow w-full text-center">
            {property.name}
        </div>
    {/each}
</div>
