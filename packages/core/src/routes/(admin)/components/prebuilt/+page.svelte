<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import CreateComponentSchema from './CreateComponentSchema.svelte'
  import ComponentSchema from './ComponentSchema.svelte'

  export let data
</script>

<TopPanel>
    <h1 class="text-2xl">
        Prebuilt component management
    </h1>
    <svelte:fragment slot="right">
        <CreateComponentSchema/>
    </svelte:fragment>
</TopPanel>

<div class="grid grid-cols-6 gap-5 p-5">
    {#each data.componentSchemas as schema (schema.name)}
        <ComponentSchema {schema}/>
    {/each}
</div>
