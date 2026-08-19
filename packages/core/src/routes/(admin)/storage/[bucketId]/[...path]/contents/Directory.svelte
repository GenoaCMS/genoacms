<script lang="ts">
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import { page } from '$app/state'
  import CardLink from '$lib/components/CardLink.svelte'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
  import RenameModal from './RenameModal.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import Selectable from './Selectable.svelte'

  type Props = {
    path: string,
    navigationPath: string,
    reference: ObjectReference,
  }
  const { path, navigationPath, reference }: Props = $props()
  const searchParams = $derived('?' + page.url.searchParams.toString() || '')
  const nameWithoutPrefix = $derived(reference.name.replace(path, ''))
  const prettyName = $derived(nameWithoutPrefix.replace('/', '') || '/')
  let contextMenuEvent: MouseEvent | null = $state(null)
  let isRenameModalOpen = $state(false)

  function toggleRenameModal () {
    isRenameModalOpen = !isRenameModalOpen
  }
  function openContextMenu (event: MouseEvent) {
    contextMenuEvent = event
  }
</script>

<ContextMenu bind:opener={contextMenuEvent}>
  <!-- A move relocates rather than removes, so renaming is a write. -->
  <PermissionGate permission="storage:bucket:write" resource={page.params.bucketId}>
    <ContextMenuItem onclick={toggleRenameModal}>
      Rename
    </ContextMenuItem>
  </PermissionGate>
</ContextMenu>

<div class="transition-all hover:scale-105">
  <Selectable name={reference.name} isDirectory>
    <CardLink
      text={prettyName}
      href="/storage/{reference.bucket}/{navigationPath}{page.data.delimiter}{nameWithoutPrefix}/contents{searchParams}"
      icon="folder"
      oncontextmenu={openContextMenu}
      noscale
    />
  </Selectable>
</div>

<RenameModal isDirectory={true} name={prettyName} bind:isModalOpen={isRenameModalOpen}/>
