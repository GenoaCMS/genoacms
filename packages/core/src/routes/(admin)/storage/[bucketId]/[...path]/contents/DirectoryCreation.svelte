<script lang="ts">
  import { enhance } from '$app/forms'
  import { alertPending, Toast } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import Portal from '$lib/components/Portal.svelte'

  let isDirectoryCreationModalOpen = $state(false)
  function toggleDirectoryCreationModal () {
    isDirectoryCreationModalOpen = !isDirectoryCreationModalOpen
  }
  function enhanceCreation () {
    const alert = alertPending('Creating')
    isDirectoryCreationModalOpen = false
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        Toast.fire({
          icon: 'error',
          title: 'Failed to create directory'
        })
        return
      }
      Toast.fire({
        icon: 'success',
        title: 'Directory created'
      })
      invalidateAll()
    }
  }
</script>

<button class="h-full flex items-center px-3" onclick={toggleDirectoryCreationModal}>
    <i class="bi bi-folder-plus text-2xl text-white hover:text-warning transition-all"/>
</button>

<Portal>
  <Modal title="Create directory" bind:open={isDirectoryCreationModalOpen}>
    <form enctype="multipart/form-data" action="?/createDirectory" method="post" use:enhance={enhanceCreation} class="flex flex-col p-4">
      <Label for="directoryName" class="pb-2">
        Name:
        <Input id="directoryName" name="directoryName" class="w-full"/>
      </Label>
      <Button type="submit" color="light">
        Create
      </Button>
    </form>
  </Modal>
</Portal>
