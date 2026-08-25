<script lang="ts">
  import { Modal, Button, Input, Label } from '$lib/components/ui/index'
  import { createComponent } from './create.remote.js'
  import { toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { goto } from '$app/navigation'

  let name = $state('')
  let isModalOpen = $state(false)
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }

  async function submit () {
    const result = await createComponent({ name })
    if (result.status === 'success') {
      toastSuccess(result.text)
      isModalOpen = false
      goto(`prebuilt/${result.uid}`)
    } else {
      toastError(result.text)
    }
  }
</script>

<button
  aria-label="Register component"
  class="h-full flex items-center px-3"
  onclick={toggleModal}
>
  <i class="bi bi-file-plus text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Register a new component" bind:open={isModalOpen}>
  <div class="w-full">
    <form
      onsubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      class="w-full space-y-3"
    >
      <Label class="text-sm">
        Component name:
        <Input type="text" class="w-full mt-1" name="name" bind:value={name} required />
      </Label>
      <Button preset="filled" class="w-full mt-4" type="submit">Create</Button>
    </form>
  </div>
</Modal>
