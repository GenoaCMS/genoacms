<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import File from './File.svelte'
  import Folder from './Folder.svelte'
  import DirectoryCreation from './DirectoryCreation.svelte'
  import ObjectUpload from './ObjectUpload.svelte'
  import { getContext } from 'svelte'
  import ConfirmSelection from './ConfirmSelection.svelte'
  import { page } from '$app/stores'
  import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'
  import type { SelectionType } from '$lib/script/storage/types'

  export let data
  const selection: SelectionStoreT = getContext('selection')
  let selectionType: SelectionType = null
  $: selectionType = $page.url.searchParams.get('selectionType') as SelectionType
</script>

<TopPanel hrefBack={data.parentPath}>
    <h1 class="text-2xl">
        {data.path}
    </h1>
    <svelte:fragment slot="right">
        <ConfirmSelection {selectionType} {selection}/>
        <DirectoryCreation/>
        <ObjectUpload/>
    </svelte:fragment>
</TopPanel>

<div class="grid grid-cols-6 gap-5 p-5">
    {#each data.contents.directories as item}
        <div class="col-span-1">
            <Folder bucketId={data.bucketId} {...item}/>
        </div>
    {/each}
    {#each data.contents.files as item}
        <div class="col-span-1">
            <File name={item.filename} signedURL={item.signedURL}/>
        </div>
    {/each}
</div>
