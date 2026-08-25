<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button, Input, Label, Modal } from '$lib/components/ui/index'

  const { name } = $props()
  let confirmName = $state('')
  let isModalOpen = $state(false)
  function toggleModal () {
    isModalOpen = !isModalOpen
  }
</script>

<button class="h-full flex items-center px-3 cursor-pointer" onclick={toggleModal} aria-label="Delete component">
    <i class="bi bi-trash3 text-2xl hover:text-error-500 transition-all"></i>
</button>

<Modal title="Delete the component" bind:open={isModalOpen}>
    <div class="w-full">
        <form action="?/delete" method="post" use:enhance class="w-full">
            <Label class="mb-2">
                To confirm deletion, type "{name}":
            </Label>
            <Input type="text" name="name" bind:value={confirmName} required/>
            <Button preset="filled" class="!bg-error-500 w-full mt-2" type="submit" disabled={name !== confirmName}>
                Yes, delete {name}
            </Button>
        </form>
    </div>
</Modal>
