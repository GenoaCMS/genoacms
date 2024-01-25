<script lang="ts">
  import { extractProperties } from './utils'
  export let schema
  const properties = extractProperties(schema.properties)
</script>

<div class="border-bottom border-dark text-center flex">
    {#each properties as property}
        <div class="m-auto">
            {property.name}
        </div>
    {/each}
</div>
