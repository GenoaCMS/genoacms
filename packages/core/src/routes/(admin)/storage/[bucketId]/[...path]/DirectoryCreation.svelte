<script lang="ts">
  import { enhance } from '$app/forms'
  import Modal from '$lib/components/Modal.svelte'
  import Button from '$lib/components/Button.svelte'
  import Input from '$lib/components/Input.svelte'
  import { Toast } from '$lib/script/alert'

  let isDirectoryCreationModalOpen = false
  const toggleDirectoryCreationModal = () => {
    isDirectoryCreationModalOpen = !isDirectoryCreationModalOpen
  }
  const enhanceCreation = () => {
    return async ({ result }) => {
      toggleDirectoryCreationModal()
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
    }
  }
</script>

<Button on:click={toggleDirectoryCreationModal}>
    Create directory
</Button>

<Modal bind:isOpen={isDirectoryCreationModalOpen}>
    <h1 class="text-2xl">
        Create directory
    </h1>
    <form action="?/createDirectory" method="post" use:enhance={enhanceCreation} class="flex flex-col gap-5">
        <label>
            Name
            <Input name="directoryName"/>
        </label>
        <Button type="submit">
            Create
        </Button>
    </form>
</Modal>
