<script lang="ts">
    import TopPanel from '$lib/components/TopPanel.svelte'
    import CreateComponentSchema from './CreateComponentEntry.svelte'
    import ComponentEntry from './ComponentEntry.svelte'
    import Grid from '$lib/components/Grid.svelte'
    import PermissionGate from '$lib/components/PermissionGate.svelte'

    const { data } = $props()
</script>

<TopPanel>
    <h1 class="text-2xl">Prebuilt component management</h1>
    {#snippet right()}
        <!-- Registering and removing are the same permission: removal is the inverse of
             registration, so a role that may adjust a component cannot destroy one. -->
        <PermissionGate permission="components:prebuilt:register">
            <CreateComponentSchema />
        </PermissionGate>
    {/snippet}
</TopPanel>

<Grid>
    {#each data.componentEntries as entry (entry.uid)}
        <ComponentEntry {entry} />
    {/each}
</Grid>
