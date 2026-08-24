<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import { enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { Button, Input, Label, Modal } from '$lib/components/ui/index'
  import {
    confirmationPhrase,
    matchesConfirmation,
    type NamedSelection
  } from '$lib/script/selection/NamedSelection.svelte'

  /**
   * Deleting everything selected, confirmed by typing the names back.
   *
   * A single-item deletion asks for one name. Several is a different risk: the number is the part
   * people misjudge, and one word would confirm nothing about how much is about to go. Asking for
   * the whole sequence makes the size of the operation impossible to miss, and — unlike a yes/no —
   * it cannot be satisfied out of habit.
   *
   * The typed phrase is checked again on the server. What is submitted is the id list, and a request
   * that arrives without a matching confirmation deletes nothing.
   */
  interface Props {
    selection: NamedSelection
    /** The form action to post to, e.g. `?/deleteSelected`. */
    action: string
    /** What is being removed, for the wording: "component" or "page". */
    noun: string
  }
  const { selection, action, noun }: Props = $props()

  let typed = $state('')
  let isModalOpen = $state(false)

  const expected = $derived(confirmationPhrase(selection.names))
  const isConfirmed = $derived(matchesConfirmation(typed, selection.names))
  const count = $derived(selection.size)
  const subject = $derived(count === 1 ? noun : `${noun}s`)

  const toggleModal = () => {
    typed = ''
    isModalOpen = !isModalOpen
  }

  const enhanceDeletion: SubmitFunction = () => async ({ result, update }) => {
    if (result.type !== 'success' && result.type !== 'redirect') {
      toastError('Deletion failed')
      return
    }
    isModalOpen = false
    // Read before clearing. `count` and `subject` are derived from the selection, so building the
    // message afterwards reported "Deleted 0 components" however many had just gone.
    const removed = `${count} ${subject}`
    selection.clear()
    toastSuccess(`Deleted ${removed}`)
    await update()
    await invalidateAll()
  }
</script>

{#if !selection.isEmpty}
  <button
    type="button"
    onclick={toggleModal}
    aria-label="Delete selected"
    class="h-full flex items-center px-3"
  >
    <i class="bi bi-trash3 text-2xl hover:text-error-500 transition-all"></i>
  </button>
{/if}

<Modal title="Delete {count} {subject}" bind:open={isModalOpen}>
  <div class="w-full">
    <p class="text-sm opacity-70 mb-3">
      This removes {count} {subject}. Anything depending on {count === 1 ? 'it' : 'them'} stops
      working.
    </p>

    <form method="post" {action} use:enhance={enhanceDeletion} class="w-full">
      <input type="hidden" name="ids" value={JSON.stringify(selection.ids)} />
      <input type="hidden" name="names" value={JSON.stringify(selection.names)} />

      <Label class="mb-2">
        To confirm, type the {subject} in order:
        <!-- The phrase grows with the selection, and a long one used to push the whole modal into
             its own scroll — moving the confirmation field and the button off screen. Bounded here
             so only the phrase scrolls, and everything needed to act on it stays where it was. -->
        <code
          class="block my-2 p-2 text-xs bg-surface-100-900 rounded break-all select-all
                 max-h-32 overflow-y-auto"
        >{expected}</code>
        <Input type="text" name="confirmation" class="w-full mt-1" bind:value={typed} required />
      </Label>

      <Button
        preset="filled"
        class="!bg-error-500 w-full mt-2"
        type="submit"
        disabled={!isConfirmed}
      >
        Yes, delete {count} {subject}
      </Button>
    </form>
  </div>
</Modal>
