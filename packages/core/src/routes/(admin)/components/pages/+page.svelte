<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import Page from './Page.svelte'
  import Grid from '$lib/components/Grid.svelte'
  import CreatePage from './CreatePage.svelte'

  export let data
</script>

<TopPanel>
    <h1 class="text-2xl">
        Pages
    </h1>
    <svelte:fragment slot="right">
        <CreatePage/>
    </svelte:fragment>
</TopPanel>

<Grid>
    {#each data.pages as page (page)}
        <Page name={page}/>
    {/each}
</Grid>
