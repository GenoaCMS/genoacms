<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import File from './File.svelte'
  import Directory from './Directory.svelte'
  import DirectoryCreation from './DirectoryCreation.svelte'
  import ObjectUpload from './ObjectUpload.svelte'
  import Selection from './Selection.svelte'
  import ConfirmMove from './ConfirmMove.svelte'
  import Grid from '$lib/components/Grid.svelte'
  import Delete from './Delete.svelte'

  const { data } = $props()
</script>

<TopPanel hrefBack={data.parentPath}>
    <h1 class="text-2xl">
        {data.path}
    </h1>
    <svelte:fragment slot="right">
        <ConfirmMove/>
        <Delete />
        <Selection />
        <DirectoryCreation/>
        <ObjectUpload/>
    </svelte:fragment>
</TopPanel>

<Grid>
    {#each data.contents.directories as item}
        <div class="col-span-1">
            <Directory path={data.path} navigationPath={data.navigationPath} reference={item}/>
        </div>
    {/each}
    {#each data.contents.files as item}
        <div class="col-span-1">
            <File name={item.name} filename={item.filename} signedURL={item.signedURL}/>
        </div>
    {/each}
</Grid>
