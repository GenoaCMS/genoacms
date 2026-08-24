<script lang="ts">
    import { Button, Input, Label, Modal } from '$lib/components/ui/index'
    import { toastError, toastSuccess } from '$lib/script/alert.svelte'
    import { deleteComponentRemote } from './delete.remote.js'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'

    const { uid, name } = $props()
    let isModalOpen = $state(false)
    let confirmationName = $state('')

    function toggleModal () {
      isModalOpen = !isModalOpen
    }

    /**
     * Deletes, and reports what the server actually said.
     *
     * A refusal comes back as a returned `{ status: 'fail' }` rather than as a thrown error, and
     * `submit()` resolves to a boolean rather than to that value. Reporting success regardless made
     * this a destructive control that always claimed to have worked — and it never did, because the
     * confirmation field had no `name`, so the server received no name to match and refused every
     * time.
     */
    const enhance = deleteComponentRemote.enhance(async ({ submit }) => {
      try {
        await submit()
        const result = deleteComponentRemote.result
        if (result === undefined || result.status !== 'success') {
          toastError(result?.text ?? 'The deletion was refused, and gave no reason')
          return
        }
        toastSuccess(result.text)
        isModalOpen = false
        await goto(resolve('/components/editor'))
      } catch (error: any) {
        toastError(error.message ?? error.code)
      }
    })
</script>

<button
    class="h-full flex items-center px-3"
    onclick={toggleModal}
    aria-label="Delete component"
>
  <i class="bi bi-trash3 text-2xl hover:text-error-500 transition-all"></i>
</button>

<Modal title="Delete the component" bind:open={isModalOpen}>
  <div class="w-full">
      <form
        {...enhance}
        class="w-full"
        enctype="multipart/form-data"
      >
        <Label class="mb-2">
          To confirm deletion, type "{name}":
        </Label>

        <input type="hidden" name="uid" value={uid} />
        <!-- Named, or the server receives no confirmation to compare and refuses every deletion. -->
        <Input type="text" name="name" bind:value={confirmationName} required />
        <Button preset="filled" class="!bg-error-500 w-full mt-2" type="submit">
          Yes, delete {name}
        </Button>
      </form>
    </div>
  </Modal>
