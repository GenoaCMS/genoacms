<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import Grid from '$lib/components/Grid.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'

    const { data } = $props()
</script>

<TopPanel>
    <hi class="text-2xl">
        Collections
    </hi>
</TopPanel>
<div class="bg-dark text-warning">
</div>

<Grid>
    {#each data.collectionReferences as collection}
        <div class="col-span-1">
            <CardLink href="/collections/{collection}" icon="collection" text={collection}/>
        </div>
    {/each}
</Grid>
