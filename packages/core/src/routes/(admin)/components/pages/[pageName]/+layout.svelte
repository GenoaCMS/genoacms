<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import UpdatePreviewURL from './UpdatePreviewURL.svelte'
  import SavePageContents from './SavePageContents.svelte'
  import Build from './Build.svelte'
  import Undo from './Undo.svelte'
  import Redo from './Redo.svelte'


  const { children, data } = $props()

  const backClickAction = (event: MouseEvent) => {
    event.preventDefault()
    history.back()
  }
</script>

<div class="h-full flex flex-col">
    <TopPanel hrefBack="" onclick={backClickAction}>
        <h1 class="text-2xl">
            {data.page.name}
        </h1>
	      {#snippet right()}
            <Undo isEnabled={data.canUndo}/>
            <Redo isEnabled={data.canRedo}/>
            <Build />
            <SavePageContents />
            <UpdatePreviewURL bind:value={data.page.previewURL}/>
	      {/snippet}
    </TopPanel>

    <div class="flex-grow grid grid-cols-6">
        <div class="col-span-4 flex justify-center items-center bg-light dark:bg-dark-light border-x dark:border-dark p-4">
            {#if data.page.previewURL}
                <iframe src={data.page.previewURL} title="Preview" class="w-full h-full border"></iframe>
            {:else}
                <div class="text-2xl">
                    No preview URL set
                </div>
            {/if}
        </div>
        <div class="col-span-2">
          {@render children?.()}
        </div>
    </div>
</div>
