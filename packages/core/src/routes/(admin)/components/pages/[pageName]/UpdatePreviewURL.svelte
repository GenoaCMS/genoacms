<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import type { SubmitFunction } from '@sveltejs/kit'

  interface Props {
    value: string
  }
  let { value }: Props = $props()
  let isModalOpen = $state(false)

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

<button class="h-full flex items-center px-3" onclick={toggleModal} aria-label="Update preview URL">
    <i class="bi bi-input-cursor-text text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Edit preview URL:" bind:open={isModalOpen}>
    <div class="flex justify-center">
        <form action="?/changePreviewURL" method="post" use:enhance={enhanceEdit} class="w-3/4 mx-auto">
            <Label>
                Preview URL:
                <Input type="url" name="value" {value} class="w-full"/>
            </Label>
            <Button type="submit" color="light" class="mt-4 w-full">
                Edit
            </Button>
        </form>
    </div>
</Modal>
