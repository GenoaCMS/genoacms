<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import Page from './Page.svelte'
  import Grid from '$lib/components/Grid.svelte'
  import CreatePage from './CreatePage.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'

  const { data } = $props()
</script>

<TopPanel>
    <h1 class="text-2xl">
        Pages
    </h1>
    {#snippet right()}
        <!-- Creating a page writes its structure. -->
        <PermissionGate permission="pages:structure_edit">
            <CreatePage components={data.componentSchemas}/>
        </PermissionGate>
    {/snippet}
</TopPanel>

<Grid>
  {#await data.pages then pages}
    {#each pages as page (page)}
        <Page name={page}/>
    {/each}
  {/await}
</Grid>
