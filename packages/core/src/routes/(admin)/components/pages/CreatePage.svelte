<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import type { ComponentHeader } from '$lib/script/components/componentHeader/component/types'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { applyAction, enhance } from '$app/forms'
  import { Button, Input, Label, Modal, Select, } from '$lib/components/ui/index'

  interface Props {
    components: Array<ComponentHeader>
  }
  const { components }: Props = $props()
  let isModalOpen = $state(false)

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceCreation: SubmitFunction = () => {
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

<button class="h-full flex items-center px-3" onclick={toggleModal} aria-label="Create page">
    <i class="bi bi-window-plus text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Create a new page" bind:open={isModalOpen}>
    <form method="post" action="?/createPage" use:enhance={enhanceCreation} class="w-full space-y-3">
        <Label>
            Name:
            <Input type="text" name="name" class="w-full" required/>
        </Label>
        <Label>
            Component:
            <Select name="componentUID" class="w-full">
                {#each components as component (component.uid)}
                    <option value={component.uid}>{component.name}</option>
                {/each}
            </Select>
        </Label>
        <Button preset="filled" class="w-full mt-4" type="submit">
            Create
        </Button>
    </form>
</Modal>
