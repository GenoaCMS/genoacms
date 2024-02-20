<script lang="ts">
    import type { ComponentNode } from '$lib/script/components/page/types'
    import { enhance } from '$app/forms'
    import { alertPending, toastError, toastSuccess } from '$lib/script/alert'

    export let contents: ComponentNode

    const enhanceSave = () => {
      alertPending('Saving')
      return async ({ result }) => {
        if (result.type !== 'success') {
          toastError('Error saving')
          return
        }
        toastSuccess('Saved')
      }
    }
    const getDiff = (contents: ComponentNode) => {
      return JSON.stringify({
        contents
      })
    }
    $: diff = getDiff(contents)
</script>

<form action="?/updatePage" method="post" use:enhance={enhanceSave}>
    <input name="diff" type="hidden" value={diff}>
    <button class="h-full flex items-center px-3">
        <i class="bi bi-floppy text-2xl hover:text-warning transition-all"/>
    </button>
</form>
