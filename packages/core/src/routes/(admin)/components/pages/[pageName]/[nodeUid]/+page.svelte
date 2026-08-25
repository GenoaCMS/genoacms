<script lang="ts">
    import type { SubmitFunction } from '@sveltejs/kit'
    import type { AttributeValue } from '$lib/script/components/componentHeader/attribute/types'
    import ComponentNode from './Editor/ComponentNode.svelte'
    import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
    import { enhance } from '$app/forms'
    import { invalidateAll } from '$app/navigation'

    const { data } = $props()
    let currentNode = $state(data.node)
    const enhanceUpdate: SubmitFunction = () => {
      alertPending('Saving')
      return async ({ result }) => {
        if (result.type !== 'success') {
          toastError('Error saving')
          return
        }
        toastSuccess('Saved')
      }
    }
    const enhanceUndo: SubmitFunction = async () => {
      alertPending('Undoing')
      return async ({ result }) => {
        if (result.type !== 'success') {
          toastError('Undo failed')
          return
        }
        await invalidateAll()
        toastSuccess('Undid')
      }
    }
    const enhanceRedo: SubmitFunction = () => {
      alertPending('Redoing')
      return async ({ result }) => {
        if (result.type !== 'success') {
          toastError('Redo failed')
          return
        }
        await invalidateAll()
        toastSuccess('Redid')
      }
    }
    function updateAttribute (uid: string, value: AttributeValue) {
      currentNode.data[uid].value = value
    }
    $effect(() => {
      currentNode = data.node
    })
</script>

<div class="h-full flex flex-col p-4">
  <div class="flex-grow">
    <ComponentNode node={currentNode} onupdate={updateAttribute}/>
  </div>
</div>

<form id="update-form" action="?/update" method="post" use:enhance={enhanceUpdate} hidden>
    <input type="text" name="componentNode" value={JSON.stringify(currentNode)} />
</form>
<form id="build-form" action="?/updateAndGenerateTree" method="post" use:enhance={enhanceUpdate} hidden>
    <input type="text" name="componentNode" value={JSON.stringify(currentNode)} />
</form>
<form id="undo-form" action="?/undo" method="post" use:enhance={enhanceUndo} hidden>
</form>
<form id="redo-form" action="?/redo" method="post" use:enhance={enhanceRedo} hidden>
</form>
