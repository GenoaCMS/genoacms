<script lang="ts">
  import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'
  import CardLink from '$lib/components/CardLink.svelte'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import ContextMenu from '$lib/components/ContextMenu.svelte'
  import ContextMenuItem from '$lib/components/ContextMenuItem.svelte'

  interface Props {
    entry: ComponentEntry
  }
  const { entry }: Props = $props()

  let contextMenuEvent: MouseEvent | null = $state(null)

  const openContextMenu = (event: MouseEvent) => {
    contextMenuEvent = event
  }

  const enhanceDeletion = () => {
    const alert = alertPending('Deleting component entry')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Deletion failed')
        return
      }
      toastSuccess('Component entry deleted')
      invalidateAll()
    }
  }
</script>

<CardLink href="prebuilt/{entry.uid}" icon="box" text={entry.name} oncontextmenu={openContextMenu}/>
<ContextMenu bind:opener={contextMenuEvent}>
    <form action="prebuilt/{entry.uid}?/deleteComponentEntry" method="post" use:enhance={enhanceDeletion}>
        <input type="text" name="UID" value={entry.uid} hidden/>
        <ContextMenuItem type="submit">
            Delete
        </ContextMenuItem>
    </form>
</ContextMenu>
