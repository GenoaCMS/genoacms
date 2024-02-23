<script lang="ts">
    import ComponentNode from './Editor/ComponentNode.svelte'
    import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
    import { enhance } from '$app/forms'

    export let data
    const enhanceUpdate = () => {
      alertPending('Saving')
      return async ({ result }) => {
        if (result.type !== 'success') {
          toastError('Error saving')
          return
        }
        toastSuccess('Saved')
      }
    }
</script>

<div class="h-full flex flex-col p-4">
    <div class="text-2xl">
        Contents:
    </div>
    <div class="flex-grow">
        <ComponentNode bind:node={data.node} />
    </div>
</div>

<form id="update-form" action="?/update" method="post" use:enhance={enhanceUpdate} hidden>
    <input type="text" name="componentNode" value={JSON.stringify(data.node)} />
</form>
