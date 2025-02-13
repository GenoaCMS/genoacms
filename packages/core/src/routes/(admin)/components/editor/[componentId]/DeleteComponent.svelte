<script lang="ts">
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import { toastError, toastSuccess } from '$lib/script/alert'
  import { superForm } from 'sveltekit-superforms'
  import Portal from '$lib/components/Portal.svelte'

  const { deletionForm, name } = $props()
  const { form, enhance } = superForm(deletionForm, {
    onUpdate ({ form }) {
      if (!form.message) return
      if (form.message.status === 'success') toastSuccess(form.message.text)
      else toastError(form.message.text)
    }
  })
  let isModalOpen = $state(false)
  function toggleModal () {
    isModalOpen = !isModalOpen
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-trash3 text-2xl hover:text-red-600 transition-all"/>
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
