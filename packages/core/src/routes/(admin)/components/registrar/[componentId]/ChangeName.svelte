<script lang="ts">
  import { Button, Input, Modal, } from '$lib/components/ui/index'

  interface Props {
    name: string
    onrename?: () => void
  }
  let { name = $bindable(), onrename = () => {} }: Props = $props()
  let isModalOpen = $state(false)

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const onsubmit = (event: Event) => {
    event.preventDefault()
    onrename()
    toggleModal()
  }
</script>

<button
  aria-label="Change name"
  class="h-full flex items-center px-3 cursor-pointer"
  onclick={toggleModal}
>
  <i class="bi bi-input-cursor-text text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Change name" bind:open={isModalOpen}>
  <div class="w-full">
    <form {onsubmit} class="w-full space-y-3">
      <Input type="text" class="w-full" name="name" bind:value={name} required/>
      <Button preset="filled" class="w-full mt-4" type="submit">
        Save
      </Button>
    </form>
  </div>
</Modal>
