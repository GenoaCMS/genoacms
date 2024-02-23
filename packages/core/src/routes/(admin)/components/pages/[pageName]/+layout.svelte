<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import UpdatePreviewURL from './UpdatePreviewURL.svelte'
  import SavePageContents from './SavePageContents.svelte'
  import Build from './Build.svelte'
  import Undo from './Undo.svelte'
  import Redo from './Redo.svelte'

  export let data

  const backClickAction = (event: MouseEvent) => {
    event.preventDefault()
    history.back()
  }
</script>

<div class="h-full flex flex-col">
    <TopPanel on:click={backClickAction}>
        <h1 class="text-2xl">
            {data.page.name}
        </h1>
        <svelte:fragment slot="right">
            <Undo isEnabled={data.canUndo}/>
            <Redo isEnabled={data.canRedo}/>
            <Build />
            <SavePageContents />
            <UpdatePreviewURL bind:value={data.page.previewURL}/>
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
            <slot/>
        </div>
    </div>
</div>
