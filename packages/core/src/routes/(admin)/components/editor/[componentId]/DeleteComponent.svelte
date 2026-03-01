<script lang="ts">
    import { Button, Input, Label, Modal, } from '$lib/components/ui/index.ts'
    import Portal from '$lib/components/Portal.svelte'
    import { toastError, toastSuccess } from '$lib/script/alert'
    import { deleteComponentRemote } from './delete.remote.js'
    import { goto } from '$app/navigation'

    const { uid, name } = $props()
    let isModalOpen = $state(false)
    let confirmationName = $state('')

    function toggleModal () {
      isModalOpen = !isModalOpen
    }

    const enhance = deleteComponentRemote.enhance(async ({ submit }) => {
      try {
        const result = await submit()
        console.log(result)
        toastSuccess('Component deleted')
        goto('.')
      } catch (error) {
        toastError(error.code)
      }
    })
</script>

<button
    class="h-full flex items-center px-3"
    onclick={toggleModal}
    aria-label="Delete component"
>
  <i class="bi bi-trash3 text-2xl hover:text-red-600 transition-all"></i>
</button>

<Portal>
  <Modal title="Delete the component" bind:open={isModalOpen}>
    <div class="flex w-3/4 mx-auto">
      <form
        {...enhance}
        class="w-full"
        enctype="multipart/form-data"
      >
        <Label class="mb-2">
          To confirm deletion, type "{name}":
        </Label>

        <input type="hidden" name="uid" value={uid} />
        <Input type="text" bind:value={confirmationName} required />
        <Button preset="filled" class="!bg-error-500 w-full mt-2"  type="submit">
          Yes, delete {name}
        </Button>
      </form>
    </div>
  </Modal>
</Portal>
