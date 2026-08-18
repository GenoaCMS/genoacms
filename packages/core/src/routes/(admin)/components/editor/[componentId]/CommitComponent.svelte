<script lang="ts">
  import { Button, Input, Label, Modal } from '$lib/components/ui/index'
  import DiffEditor from '$lib/components/ui/DiffEditor.svelte'
  import { commitComponentRemote } from './commit.remote.js'
  import { toastError, toastSuccess } from '$lib/script/alert.svelte'

  interface Props {
    componentId: string;
    uncommitedCode: string;
    code: string;
  }
  const { componentId, uncommitedCode, code }: Props = $props()

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

  const disabled = $derived(code === uncommitedCode)
</script>

<button
  class="h-full flex items-center px-3"
  onclick={toggleModal}
  aria-label="Commit"
>
  <i class="bi bi-rocket-takeoff text-2xl hover:text-primary transition-all"
  ></i>
</button>

<Modal title="Commit changes" bind:open={isModalOpen} size="xl">
  <div class="w-full space-y-4">
    <DiffEditor
      originalValue={code}
      modifiedValue={uncommitedCode}
      language="javascript"
    />
    <form {...enhance} class="w-full space-y-2" enctype="multipart/form-data">
      <Label class="text-sm font-medium">Commit message:</Label>
      <input type="hidden" name="componentId" value={componentId} />
      <Input
        type="text"
        name="message"
        bind:value={message}
        {disabled}
        placeholder="Describe your changes..."
        required
      />
      <Button preset="filled" class="w-full mt-4" type="submit" {disabled}>
        Commit
      </Button>
    </form>
  </div>
</Modal>
