<script lang="ts">
  import { activityTracker } from '$lib/script/activity/client'
  import { onNavigate } from '$app/navigation'
  import { page } from '$app/state'
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
  const sessionId = page.url.searchParams.get('sessionId') || crypto.randomUUID()
  function trackActivity ({ bucketId, navigationPath }) {
    activityTracker.add({
      type: 'storage',
      timestamp: Date.now(),
      sessionId,
      bucket: bucketId,
      path: navigationPath
    })
  }
  onNavigate(() => {
    trackActivity(data)
  })
</script>

<TopPanel hrefBack={data.parentPath}>
    <h1 class="text-2xl">
        {data.path}
    </h1>
    {#snippet right()}
        <ConfirmMove/>
        <Delete />
        <Selection />
        <DirectoryCreation/>
        <ObjectUpload/>
    {/snippet}
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
