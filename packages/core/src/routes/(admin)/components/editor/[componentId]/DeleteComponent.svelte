<script lang="ts">
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import { formConfig } from '$lib/script/forms'
  import { superForm } from 'sveltekit-superforms'
  import Portal from '$lib/components/Portal.svelte'

  const { deletionForm, name } = $props()
  const { form, enhance } = superForm(deletionForm, formConfig)
  let isModalOpen = $state(false)
  function toggleModal () {
    isModalOpen = !isModalOpen
  }
</script>

<button class="h-full flex items-center px-3" onclick={toggleModal} aria-label="Delete component">
    <i class="bi bi-trash3 text-2xl hover:text-red-600 transition-all"></i>
</button>

<Portal>
<Modal title="Delete the component" bind:open={isModalOpen}>
    <div class="flex w-3/4 mx-auto">
        <form action="?/delete" method="post" use:enhance={enhance} class="w-full">
            <input name="uid" value={$form.uid} hidden/>
            <Label class="mb-2">
                To confirm deletion, type "{name}":
            </Label>
            <Input type="text" name="name" value={$form.name} required/>
            <Button color="red" type="submit" class="w-full mt-2">
                Yes, delete {name}
            </Button>
        </form>
    </div>
</Modal>
</Portal>
