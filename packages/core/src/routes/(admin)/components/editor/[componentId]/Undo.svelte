<script lang="ts">
  import { enhance } from '$app/forms'

  /**
   * Steps the draft back one save.
   *
   * The registrar's control, for the component editor's history — the same `UndoRedoAdjunct`, the
   * same form action, the same enhancement. Written out rather than shared because the two live
   * under different routes and post to different actions; what is shared is the mechanism beneath
   * them, which is the part that would be costly to have twice.
   */
  interface Props {
    historyLength: number
    /** Set while the draft differs from what is stored: undoing would discard the difference. */
    unsaved: boolean
  }
  const { historyLength, unsaved }: Props = $props()

  const title = $derived(
    unsaved
      ? 'Save or discard your changes first — undo steps through saved states'
      : 'Undo'
  )
</script>

<!--
  `method` is not optional: a form without it sends GET, and an action only runs on POST.

  `use:enhance` is what keeps this from reloading the page. It posts in the background, then applies
  the result and revalidates, so the editor is rebuilt from the new state in place. Without
  JavaScript the same POST still works — the browser just navigates.

  **Disabled while there are unsaved changes.** Undo moves the *stored* body, and the editor is
  rebuilt from storage afterwards — so pressing it with an unsaved draft open would silently discard
  what the author had typed and show them an older state as though nothing had been lost.
-->
<form action="?/undo" method="post" use:enhance>
  <button
    type="submit"
    aria-label="Undo"
    {title}
    class="h-full flex items-center px-3"
    class:cursor-pointer={!!historyLength && !unsaved}
    disabled={!historyLength || unsaved}
  >
    <i class="bi bi-arrow-counterclockwise text-2xl transition-all"></i>
  </button>
</form>
