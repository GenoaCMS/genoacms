<script lang="ts">
  import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { applyAction, enhance } from '$app/forms'
  import { Button, Input, Label, Modal, Select } from 'flowbite-svelte'

  export let components: Array<ComponentEntry>
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

<Modal title="Create a new page" bind:open={isModalOpen}>
    <div class="flex justify-center">
        <form method="post" action="?/createPage" use:enhance={enhanceCreation} class="w-3/4 mx-auto">
            <Label>
                Name:
                <Input type="text" name="name" class="w-full"/>
            </Label>
            <Label>
                Component:
                <Select name="componentUID" class="w-full">
                    {#each components as component}
                        <option value={component.uid}>{component.name}</option>
                    {/each}
                </Select>
            </Label>
            <Button type="submit" color="light" class="w-full mt-3">
                Create
            </Button>
        </form>
    </div>
</Modal>
