<script lang="ts">
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import { superForm } from 'sveltekit-superforms'
  import Portal from '$lib/components/Portal.svelte'
  import DiffEditor from '$lib/components/DiffEditor.svelte'
  import { commitComponentRemote } from './commit.remote.js'
  import { toastError, toastSuccess } from '$lib/script/alert'

  const { componentId, changeForm, code } = $props()
  const { form: formChange } = superForm(changeForm)

  let isModalOpen = $state(false)
  let message = $state('')

  function toggleModal () {
    isModalOpen = !isModalOpen
  }

  const enhance = commitComponentRemote.enhance(async ({ submit }) => {
    try {
      const result = await submit()
      console.log(result)
      toastSuccess('Code commited')
      isModalOpen = false
      message = ''
    } catch (error: any) {
      toastError(error.code)
    }
  })

  const disabled = $derived(code === $formChange.uncommitedCode)
</script>

<button
  class="h-full flex items-center px-3"
  onclick={toggleModal}
  aria-label="Commit"
>
  <i class="bi bi-rocket-takeoff text-2xl hover:text-primary transition-all"
  ></i>
</button>

<Portal>
  <Modal title="Commit changes" bind:open={isModalOpen} size="xl">
    <div class="w-full h-[50rem]">
      <DiffEditor
        originalValue={code}
        modifiedValue={$formChange.uncommitedCode}
      />
    </div>
    <div class="flex w-3/4 mx-auto">
      <form {...enhance} class="w-full" enctype="multipart/form-data">
        <Label class="mb-2">Commit message:</Label>
        <input type="hidden" name="componentId" value={componentId} />
        <Input
          type="text"
          name="message"
          bind:value={message}
          {disabled}
          required
        />
        <Button color="light" type="submit" class="w-full mt-2" {disabled}>
          Commit
        </Button>
      </form>
    </div>
  </Modal>
</Portal>
