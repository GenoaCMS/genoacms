<script lang="ts">
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { applyAction, enhance } from '$app/forms'
  import Modal from '$lib/components/Modal.svelte'
  import Input from '$lib/components/Input.svelte'
  import Button from '$lib/components/Button.svelte'
  import { Label, Select } from 'flowbite-svelte'
  import type { ComponentSchemaFile } from '$lib/script/components/types'

  export let components: Array<ComponentSchemaFile>
  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceCreation = () => {
    const alert = alertPending('Creating')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'redirect') {
        toastError('Creation failed')
        return
      }
      toastSuccess('Creation successful')
      isModalOpen = false
      await applyAction(result)
    }
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-window-plus text-2xl hover:text-warning transition-all"/>
</button>

<Modal bind:isOpen={isModalOpen}>
    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            Create a new page
        </h1>
    </svelte:fragment>
    <div class="flex w-3/4 mx-auto justify-center">
        <form method="post" action="?/createPage" use:enhance={enhanceCreation}>
            <Label>
                Name:
                <Input type="text" name="name" class="w-full"/>
            </Label>
            <Label>
                Component:
                <Select name="contents" class="w-full">
                    {#each components as component}
                        <option value={component.name}>{component.name}</option>
                    {/each}
                </Select>
            </Label>
            <Button class="w-full mt-3">
                Create
            </Button>
        </form>
    </div>
</Modal>
