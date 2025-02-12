<script lang="ts">
  import { superForm } from 'sveltekit-superforms'
  import { toastError, toastSuccess } from '$lib/script/alert'
  import { Button, Input, Label, Modal } from 'flowbite-svelte'

  const { createForm } = $props()
  const { form, enhance } = superForm(createForm, {
    onUpdate ({ form }) {
      if (!form.message) return
      if (form.message.status === 'success') toastSuccess(form.message.text)
      else toastError(form.message.text)
    }
  })

</script>

<form action="?/create" method="post" use:enhance={enhance} class="w-full">
  <Label class="pb-2">
    Name:
    <Input type="text" name="name" value={$form.name}/>
  </Label>
  <Button type="submit" color="light" class="w-full">
    Create
  </Button>
</form>
