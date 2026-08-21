<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import Page from './Page.svelte'
  import Grid from '$lib/components/Grid.svelte'
  import CreatePage from './CreatePage.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import SelectableCard from '$lib/components/selection/SelectableCard.svelte'
  import SelectionToggle from '$lib/components/selection/SelectionToggle.svelte'
  import DeleteSelected from '$lib/components/selection/DeleteSelected.svelte'
  import { NamedSelection } from '$lib/script/selection/NamedSelection.svelte'

  const { data } = $props()

  const selection = new NamedSelection()
  // A page is addressed by its name, so id and name are the same value here.
  const entries = $derived(data.pages.map((name: string) => ({ id: name, name })))
</script>

<TopPanel>
    <h1 class="text-2xl">
        Pages
    </h1>
    {#snippet right()}
        <PermissionGate permission="pages:delete">
            <DeleteSelected {selection} action="?/deleteSelected" noun="page" />
        </PermissionGate>
        <SelectionToggle {selection} {entries} />
        <!-- Creating a page writes its structure. -->
        <PermissionGate permission="pages:structure_edit">
            <CreatePage components={data.componentSchemas}/>
        </PermissionGate>
    {/snippet}
</TopPanel>

<Grid>
    {#each data.pages as name (name)}
        <SelectableCard {selection} entry={{ id: name, name }}>
            <Page {name}/>
        </SelectableCard>
    {/each}
</Grid>
