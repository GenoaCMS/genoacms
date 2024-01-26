<script lang="ts">
    import TopPanel from '$lib/components/TopPanel.svelte'
    import File from 'bootstrap-icons/icons/file-earmark.svg'
    import CardLink from '$lib/components/CardLink.svelte'

    export let data
</script>

<TopPanel>
    <h1 class="text-2xl">
        {data.path}
    </h1>
</TopPanel>

<div class="grid grid-cols-4 gap-5 p-5">
    {#each data.contents as item}
        <div class="col-span-1">
            <CardLink text={item.name} icon={File}/>
        </div>
    {/each}
</div>
