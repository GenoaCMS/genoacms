<script lang="ts">
    import TopPanel from '$lib/components/TopPanel.svelte'
    import CreateComponentSchema from './CreateComponentHeader.svelte'
    import ComponentHeader from './ComponentHeader.svelte'
    import Grid from '$lib/components/Grid.svelte'
    import PermissionGate from '$lib/components/PermissionGate.svelte'
    import SelectableCard from '$lib/components/selection/SelectableCard.svelte'
    import SelectionToggle from '$lib/components/selection/SelectionToggle.svelte'
    import DeleteSelected from '$lib/components/selection/DeleteSelected.svelte'
    import { NamedSelection } from '$lib/script/selection/NamedSelection.svelte'

    const { data } = $props()

    const selection = new NamedSelection()
    // A component is acted on by uid and read by name: two components may share a name, and only
    // the uid distinguishes them.
    const entries = $derived(data.componentEntries.map(entry => ({ id: entry.uid, name: entry.name })))
</script>

<TopPanel>
    <h1 class="text-2xl">Prebuilt component management</h1>
    {#snippet right()}
        <!-- Registering and removing are the same permission: removal is the inverse of
             registration, so a role that may adjust a component cannot destroy one.
             Selection itself is not gated — selecting is not an operation, what it enables is. -->
        <PermissionGate permission="components:prebuilt:register">
            <DeleteSelected {selection} action="?/deleteSelected" noun="component" />
        </PermissionGate>
        <SelectionToggle {selection} {entries} />
        <PermissionGate permission="components:prebuilt:register">
            <CreateComponentSchema />
        </PermissionGate>
    {/snippet}
</TopPanel>

<Grid>
    {#each data.componentEntries as entry (entry.uid)}
        <SelectableCard {selection} entry={{ id: entry.uid, name: entry.name }}>
            <ComponentHeader {entry} />
        </SelectableCard>
    {/each}
</Grid>
