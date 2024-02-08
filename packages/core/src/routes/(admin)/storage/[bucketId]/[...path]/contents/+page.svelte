<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import File from './File.svelte'
  import Folder from './Folder.svelte'
  import DirectoryCreation from './DirectoryCreation.svelte'
  import ObjectUpload from './ObjectUpload.svelte'

  export let data
  console.log(data)
</script>

<TopPanel>
    <h1 class="text-2xl">
        {data.path}
    </h1>
    <svelte:fragment slot="right">
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
            <File name={item.filename}/>
        </div>
    {/each}
</div>
