<script lang="ts">
  import { enhance, applyAction } from '$app/forms'
  import { Label } from 'flowbite-svelte'
  import Button from '$lib/components/Button.svelte'
  import Modal from '$lib/components/Modal.svelte'
  import Input from '$lib/components/Input.svelte'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'

  export let value: string
  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceEdit = () => {
    const alert = alertPending('Editing')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Edit failed')
        return
      }
      toastSuccess('Edit successful')
      isModalOpen = false
      await applyAction(result)
    }
  }
  const generateDiffJSON = (previewURL: string) => {
    return JSON.stringify({
      previewURL
    })
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-input-cursor-text text-2xl hover:text-warning transition-all"/>
</button>

<Modal bind:isOpen={isModalOpen}>
    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            Edit preview URL:
        </h1>
    </svelte:fragment>
    <div class="flex w-3/4 mx-auto justify-center">
        <div>
            <Label>
                Preview URL:
                <Input type="text" bind:value class="w-full"/>
            </Label>
            <form action="?/updatePage" method="post" use:enhance={enhanceEdit}>
                <input type="hidden" name="diff" value={generateDiffJSON(value)}/>
                <Button type="submit" class="mt-4 w-full">
                    Edit
                </Button>
            </form>
        </div>
    </div>
</Modal>
