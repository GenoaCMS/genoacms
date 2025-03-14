<script lang="ts">
  import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'
  import { getContext } from 'svelte'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import File from './File.svelte'
  import Folder from './Folder.svelte'
  import DirectoryCreation from './DirectoryCreation.svelte'
  import ObjectUpload from './ObjectUpload.svelte'
  import ConfirmSelection from './ConfirmSelection.svelte'
  import ConfirmMove from './ConfirmMove.svelte'
  import Grid from '$lib/components/Grid.svelte'

  const { data } = $props()
  const selection: SelectionStoreT = getContext('selection')
</script>

<TopPanel hrefBack={data.parentPath}>
    <h1 class="text-2xl">
        {data.path}
    </h1>
    <svelte:fragment slot="right">
        <ConfirmMove/>
        <ConfirmSelection {selection}/>
        <DirectoryCreation/>
        <ObjectUpload/>
    </svelte:fragment>
</TopPanel>

<Grid>
    {#each data.contents.directories as item}
        <div class="col-span-1">
            <Folder currentPath={data.navigationPath} bucketId={data.bucketId} {...item}/>
        </div>
    {/each}
    {#each data.contents.files as item}
        <div class="col-span-1">
            <File name={item.name} filename={item.filename} signedURL={item.signedURL}/>
        </div>
    {/each}
</Grid>
