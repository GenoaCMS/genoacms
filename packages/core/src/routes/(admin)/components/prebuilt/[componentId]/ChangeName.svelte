<script lang="ts">
  import { Button, Input, Modal } from 'flowbite-svelte'

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

<button aria-label="Change name" class="h-full flex items-center px-3" onclick={toggleModal}>
  <i class="bi bi-input-cursor-text text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Change name" bind:open={isModalOpen}>
  <div class="flex w-3/4 mx-auto">
    <form {onsubmit} class="w-full">
      <Input type="text" class="w-full" name="name" bind:value={name}/>
      <Button type="submit" color="light" class="w-full mt-2">
        Change
      </Button>
    </form>
  </div>
</Modal>
