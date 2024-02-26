<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import CreateComponentSchema from './CreateComponentSchema.svelte'
  import ComponentEntry from './ComponentEntry.svelte'
  import Grid from '$lib/components/Grid.svelte'

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

<Grid>
    {#each data.componentEntries as entry (entry.uid)}
        <ComponentEntry {entry}/>
    {/each}
</Grid>
