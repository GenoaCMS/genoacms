<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import Portal from '$lib/components/Portal.svelte'

  const { name } = $props()
  let confirmName = $state('')
  let isModalOpen = $state(false)
  function toggleModal () {
    isModalOpen = !isModalOpen
  }
</script>

<button class="h-full flex items-center px-3 cursor-pointer" onclick={toggleModal} aria-label="Delete component">
    <i class="bi bi-trash3 text-2xl hover:text-red-600 transition-all"></i>
</button>

<Portal>
<Modal title="Delete the component" bind:open={isModalOpen}>
    <div class="flex w-3/4 mx-auto">
        <form action="?/delete" method="post" use:enhance class="w-full">
            <Label class="mb-2">
                To confirm deletion, type "{name}":
            </Label>
            <Input type="text" name="name" bind:value={confirmName} required/>
            <Button color="red" type="submit" class="w-full mt-2" disabled={name !== confirmName}>
                Yes, delete {name}
            </Button>
        </form>
    </div>
</Modal>
</Portal>
