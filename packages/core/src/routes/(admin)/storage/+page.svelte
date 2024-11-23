<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'
    import { page } from '$app/stores'

    export let data
    $: searchParams = '?' + $page.url.searchParams.toString() || ''
</script>

<TopPanel>
    <h1 class="text-2xl">
        Buckets
    </h1>
</TopPanel>

<div class="grid grid-cols-5 gap-5 p-5">
    {#each data.buckets as bucket}
        <div class="col-span-1">
            <CardLink href="storage/{bucket.name}/contents{searchParams}" text={bucket.name} icon="bucket"/>
        </div>
    {/each}
</div>
