<script lang="ts">
  import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'
  import { superForm, type SuperForm } from 'sveltekit-superforms'
  import { formConfig } from '$lib/script/forms'
  import { Modal, Button, Input, Label } from 'flowbite-svelte'

  interface Props {
    creationForm: SuperForm<ComponentEntry>
  }
  const { creationForm }: Props = $props()
  const { form, enhance } = superForm(creationForm, formConfig)
  let isModalOpen = $state(false)
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
</script>

<button aria-label="Register component" class="h-full flex items-center px-3" onclick={toggleModal}>
  <i class="bi bi-file-plus text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Register a new component" bind:open={isModalOpen}>
  <div class="flex w-3/4 mx-auto">
    <form method="post" action="?/create" use:enhance class="w-full">
      <Label class="text-xl">
        Component name:
        <Input type="text" class="w-full" name="name" bind:value={$form.name}/>
      </Label>
      <Button type="submit" color="light" class="w-full mt-2">
        Create
      </Button>
    </form>
  </div>
</Modal>
