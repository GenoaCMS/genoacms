<script lang="ts">
  import { activityTracker } from '#lib/script/activity/client.js'
  import { onNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import { untrack } from 'svelte'
  import type { ObjectReference } from '@genoacms/contracts/storage'
  import TopPanel from '#lib/components/TopPanel.svelte'
  import File from './File.svelte'
  import Directory from './Directory.svelte'
  import DirectoryCreation from './DirectoryCreation.svelte'
  import ObjectUpload from './ObjectUpload.svelte'
  import Selection from './Selection.svelte'
  import ConfirmMove from './ConfirmMove.svelte'
  import ShowMore from './ShowMore.svelte'
  import Grid from '#lib/components/Grid.svelte'
  import Delete from './Delete.svelte'
  import PermissionGate from '#lib/components/PermissionGate.svelte'
  import { nextPage } from './listing.remote'
  import type { PageData } from './$types'

  const { data } = $props()

  type Listing = PageData['contents']
  interface Loaded {
    of: Listing
    directories: Listing['directories']
    files: Listing['files']
    next?: string
  }
  const nextOf = (listing: Listing): string | undefined => 'next' in listing ? listing.next : undefined
  const fresh = (listing: Listing): Loaded => ({ of: listing, directories: [], files: [], next: nextOf(listing) })

  // BRW-15
  let more: Loaded = $state.raw(fresh(untrack(() => data.contents)))
  const loaded = $derived(more.of === data.contents ? more : fresh(data.contents))
  const directories = $derived([...data.contents.directories, ...loaded.directories])
  const files = $derived([...data.contents.files, ...loaded.files])
  const entries: ObjectReference[] = $derived([
    ...files.map(file => ({ bucket: data.bucketId, name: file.name })),
    ...directories.map(directory => ({ bucket: data.bucketId, name: directory.name }))
  ])

  async function showMore () {
    const current = loaded
    if (current.next === undefined) return
    const listing = await nextPage({ bucket: data.bucketId, directory: data.path, pageToken: current.next })
    more = {
      of: current.of,
      directories: [...current.directories, ...listing.directories],
      files: [...current.files, ...listing.files],
      next: nextOf(listing)
    }
  }

  const sessionId = page.url.searchParams.get('sessionId') || crypto.randomUUID()
  function trackActivity ({ bucketId, navigationPath }: Pick<PageData, 'bucketId' | 'navigationPath'>) {
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
        <!-- BD5 -->
        <PermissionGate permission="storage:bucket:write" resource={data.bucketId}>
            <ConfirmMove/>
        </PermissionGate>
        <PermissionGate permission="storage:bucket:delete" resource={data.bucketId}>
            <Delete />
        </PermissionGate>
        <Selection {entries} />
        <PermissionGate permission="storage:bucket:write" resource={data.bucketId}>
            <DirectoryCreation/>
            <ObjectUpload/>
        </PermissionGate>
    {/snippet}
</TopPanel>

<Grid>
    {#each directories as item (item.name)}
        <div class="col-span-1">
            <Directory path={data.path} navigationPath={data.navigationPath} reference={item}/>
        </div>
    {/each}
    {#each files as item (item.name)}
        <div class="col-span-1">
            <File name={item.name} filename={item.filename} signedURL={item.signedURL}/>
        </div>
    {/each}
</Grid>

{#if loaded.next !== undefined}
    <ShowMore onclick={showMore}/>
{/if}
