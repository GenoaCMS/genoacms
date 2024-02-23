<script lang="ts">
  import { enhance } from '$app/forms'
  import { Input, Label, Modal } from 'flowbite-svelte'
  import Button from '$lib/components/Button.svelte'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { invalidate } from '$app/navigation'
  import type { SubmitFunction } from '@sveltejs/kit'

  export let value: string
  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceEdit = ({ formData }): SubmitFunction => {
    const alert = alertPending('Editing')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Edit failed')
        return
      }
      toastSuccess('Edit successful')
      isModalOpen = false
      value = formData.get('value')
    }
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-input-cursor-text text-2xl hover:text-warning transition-all"/>
</button>

<Modal title="Edit preview URL:" bind:open={isModalOpen}>
    <div class="flex w-3/4 mx-auto justify-center">
        <div>
            <form action="?/changePreviewURL" method="post" use:enhance={enhanceEdit}>
                <Label>
                    Preview URL:
                    <Input type="text" name="value" {value} class="w-full"/>
                </Label>
                <Button type="submit" class="mt-4 w-full">
                    Edit
                </Button>
            </form>
        </div>
    </div>
</Modal>
