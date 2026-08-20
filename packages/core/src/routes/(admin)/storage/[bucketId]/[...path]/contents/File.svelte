<script lang="ts">
  import { page } from '$app/state'
  import CardLink from '$lib/components/CardLink.svelte'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
  import Selectable from './Selectable.svelte'
  import RenameModal from './RenameModal.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'

  type Props = {
    name: string,
    filename: string,
    signedURL: string
  }
  const { name, filename, signedURL }: Props = $props()
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
  <Selectable {name}>
    <CardLink
      href={signedURL}
      target="_blank"
      text={filename}
      icon="file-earmark"
      oncontextmenu={openContextMenu}
      noscale
    />
  </Selectable>
</div>

<RenameModal isDirectory={false} name={filename} bind:isModalOpen={isRenameModalOpen}/>
