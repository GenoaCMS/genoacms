<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import UpdatePreviewURL from './UpdatePreviewURL.svelte'

  export let data
  $: console.log(data)
</script>

<div class="h-full flex flex-col">
    <TopPanel>
        <h1 class="text-2xl">
            {data.page.name}
        </h1>
        <svelte:fragment slot="right">
            <UpdatePreviewURL value={data.page.previewURL}/>
        </svelte:fragment>
    </TopPanel>

    <div class="flex-grow grid grid-cols-6">
        <div class="col-span-4 flex justify-center items-center bg-light border-e p-4">
            {#if data.page.previewURL}
                <iframe src={data.page.previewURL} title="Preview" class="w-full h-full border" />
            {:else}
                <div class="text-2xl">
                    No preview URL set
                </div>
            {/if}
        </div>
        <div class="col-span-2">

        </div>
    </div>
</div>
