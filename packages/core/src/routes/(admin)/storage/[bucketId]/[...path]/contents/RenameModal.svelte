<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import Portal from '$lib/components/Portal.svelte'
  import { Button, Input, Label, Modal } from 'flowbite-svelte'

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

<Portal>
  <Modal title="Rename" bind:open={isModalOpen}>
    <form
      action="?/rename"
      method="post"
      class="flex flex-col p-4"
      use:enhance={enhanceRename}>
      <input type="hidden" name="isDirectory" value={isDirectory}/>
      <input type="hidden" name="name" value={name} />
      <Label class="pb-2">
        New name:
        <Input name="newName" value={name} class="w-full" autofocus/>
      </Label>
      <Button type="submit" color="light">
        Rename
      </Button>
    </form>
  </Modal>
</Portal>
