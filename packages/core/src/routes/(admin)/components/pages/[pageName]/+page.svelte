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

    <div class="flex-grow">

    </div>
</div>
