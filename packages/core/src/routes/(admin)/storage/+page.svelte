<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'

    export let data
</script>

<TopPanel>
    <h1 class="text-2xl">
        Buckets
    </h1>
</TopPanel>

<div class="grid grid-cols-5 gap-5 p-5">
    {#each data.buckets as bucket}
        <div class="col-span-1">
            <CardLink href="storage/{bucket}/contents" text={bucket} icon="bucket"/>
        </div>
    {/each}
</div>
