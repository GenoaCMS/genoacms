<script lang="ts">
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import { superForm } from 'sveltekit-superforms'
  import Portal from '$lib/components/Portal.svelte'
  import DiffEditor from '$lib/components/DiffEditor.svelte'
  import { formConfig } from '$lib/script/forms'

  const { commitForm, changeForm, code } = $props()
  const { form: formChange } = superForm(changeForm)
  const { form, enhance } = superForm(commitForm, formConfig)
  let isModalOpen = $state(false)
  function toggleModal () {
    isModalOpen = !isModalOpen
  }
  const disabled = $derived(code === $formChange.uncommitedCode)
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-rocket-takeoff text-2xl hover:text-primary transition-all"/>
</button>

<Portal>
<Modal title="Commit changes" bind:open={isModalOpen} size="xl">
        <div class="w-full h-[50rem]">
        <DiffEditor originalValue={code} modifiedValue={$formChange.uncommitedCode} />
      </div>
    <div class="flex w-3/4 mx-auto">
        <form action="?/commit" method="post" use:enhance class="w-full">
            <input name="componentId" value={$form.componentId} hidden/>
            <Label class="mb-2">
                Commit message:
            </Label>
            <Input type="text" name="message" value={$form.message} {disabled} required/>
            <Button color="light" type="submit" class="w-full mt-2" {disabled}>
              Commit
            </Button>
        </form>
    </div>
</Modal>
</Portal>
