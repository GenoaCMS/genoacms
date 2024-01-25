<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import Bricks from 'bootstrap-icons/icons/bricks.svg'
    import TopPanel from '$lib/components/TopPanel.svelte'

    export let data
</script>

<TopPanel>
    collections
</TopPanel>
<div class="bg-dark text-warning">
</div>

<div class="grid grid-cols-5 gap-5 p-5">
    {#each data.collectionReferences as collection}
        <div class="col-span-1">
            <CardLink href="/collections/{collection.name}" icon={Bricks} text={collection.name}/>
        </div>
    {/each}
</div>
