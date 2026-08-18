<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { Button, Input, Label, Modal } from '$lib/components/ui/index'

  type Props = {
    name: string,
    isDirectory: boolean,
    isModalOpen: boolean
  }
  let { name, isDirectory, isModalOpen = $bindable() }: Props = $props()
  const enhanceRename: SubmitFunction = () => {
    const alert = alertPending('Renaming')
    return async ({ result }) => {
      isModalOpen = false
      alert.close()
      if (result.type !== 'success') {
        isModalOpen = true
        toastError('Renaming failed')
        return
      }
      toastSuccess('Renamed')
      invalidateAll()
    }
  }
</script>

<Modal title="Rename" bind:open={isModalOpen}>
  <form
    action="?/rename"
    method="post"
    class="flex flex-col space-y-3"
    use:enhance={enhanceRename}>
    <input type="hidden" name="isDirectory" value={isDirectory}/>
    <input type="hidden" name="name" value={name} />
    <Label>
      New name:
      <Input name="newName" value={name} class="w-full mt-1" required />
    </Label>
    <Button preset="filled" class="w-full mt-4" type="submit">
      Rename
    </Button>
  </form>
</Modal>
