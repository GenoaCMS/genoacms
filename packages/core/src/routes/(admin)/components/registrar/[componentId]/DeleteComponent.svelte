<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { applyAction, enhance } from '$app/forms'
  import { Button, Input, Label, Modal } from '$lib/components/ui/index'
  import PagesPinningComponent from '$lib/components/components/PagesPinningComponent.svelte'

  const { uid, name } = $props()
  let confirmName = $state('')
  let isModalOpen = $state(false)
  /** What the server said when it refused. Shown in the dialog, which is where the author is. */
  let refusal = $state('')
  function toggleModal () {
    isModalOpen = !isModalOpen
    refusal = ''
  }

  /**
   * Reports what the server actually said.
   *
   * A component a published page is built on is **refused**, and the refusal comes back as a
   * returned failure naming the pages. Bare `use:enhance` applied it silently: the dialog stayed
   * open, nothing was said, and the component was still there — a destructive control that looks
   * like it did nothing at all.
   *
   * Reported **in the dialog** rather than as a toast. A toast is the right shape for something that
   * happened elsewhere; this is an answer to the button the author is looking at, and it has to
   * survive next to the confirmation they are about to retype. It is also the thing they act on: the
   * message names the pages to go and change.
   */
  const enhanceDeletion: SubmitFunction = () => async ({ result }) => {
    if (result.type === 'failure') {
      refusal = String(result.data?.reason ?? 'The deletion was refused, and gave no reason')
      return
    }
    refusal = ''
    isModalOpen = false
    await applyAction(result)
  }
</script>

<button class="h-full flex items-center px-3 cursor-pointer" onclick={toggleModal} aria-label="Delete component">
    <i class="bi bi-trash3 text-2xl hover:text-error-500 transition-all"></i>
</button>

<Modal title="Delete the component" bind:open={isModalOpen}>
    <div class="w-full">
        <!-- Rendered only while the dialog is open, so the scan is paid for by an author who is
             actually about to delete something rather than by everyone who opens the registrar. -->
        {#if isModalOpen}
            <PagesPinningComponent {uid} />
        {/if}
        {#if refusal}
            <p class="text-sm text-error-500 mb-2">{refusal}</p>
        {/if}
        <form action="?/delete" method="post" use:enhance={enhanceDeletion} class="w-full">
            <Label class="mb-2">
                To confirm deletion, type "{name}":
            </Label>
            <Input type="text" name="name" bind:value={confirmName} required/>
            <Button preset="filled" class="!bg-error-500 w-full mt-2" type="submit" disabled={name !== confirmName}>
                Yes, delete {name}
            </Button>
        </form>
    </div>
</Modal>
