<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'

    export let data
</script>

<TopPanel>
    <hi class="text-2xl">
        Collections
    </hi>
</TopPanel>
<div class="bg-dark text-warning">
</div>

<div class="grid grid-cols-5 gap-5 p-5">
    {#each data.collectionReferences as collection}
        <div class="col-span-1">
            <CardLink href="/collections/{collection.name}" icon="collection" text={collection.name}/>
        </div>
    {/each}
</div>
