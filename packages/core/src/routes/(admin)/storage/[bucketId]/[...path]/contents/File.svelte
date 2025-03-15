<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'
  import Selectable from './Selectable.svelte'
  import RenameModal from './RenameModal.svelte'

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
  <ContextMenuItem onclick={toggleRenameModal}>
    Rename
  </ContextMenuItem>
</ContextMenu>

<Selectable {name}>
    <CardLink href={signedURL} target="_blank" text={filename} icon="file-earmark" oncontextmenu={openContextMenu}/>
</Selectable>

<RenameModal isDirectory={false} name={filename} bind:isModalOpen={isRenameModalOpen}/>
