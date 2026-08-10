<script lang="ts">
    import { page } from '$app/state'
    import CardLink from '$lib/components/CardLink.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'
    import Grid from '$lib/components/Grid.svelte'

    const { data } = $props()
    const searchParams = $derived('?' + page.url.searchParams.toString() || '')
</script>

<TopPanel>
    <h1 class="text-2xl">
        Buckets
    </h1>
</TopPanel>

<Grid>
    {#each data.buckets as bucket}
        <div class="col-span-1">
            <CardLink href="storage/{bucket.name}/contents{searchParams}" text={bucket.name} icon="bucket"/>
        </div>
    {/each}
</Grid>
