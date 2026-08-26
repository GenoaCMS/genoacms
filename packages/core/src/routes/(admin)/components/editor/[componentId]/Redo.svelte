<script lang="ts">
  import { enhance } from '$app/forms'

  /** Steps the draft forward one save. The mirror of `Undo`; see it for why both are disabled. */
  interface Props {
    futureLength: number
    unsaved: boolean
  }
  const { futureLength, unsaved }: Props = $props()

  const title = $derived(
    unsaved
      ? 'Save or discard your changes first — redo steps through saved states'
      : 'Redo'
  )
</script>

<form action="?/redo" method="post" use:enhance>
  <button
    type="submit"
    aria-label="Redo"
    {title}
    class="h-full flex items-center px-3"
    class:cursor-pointer={!!futureLength && !unsaved}
    disabled={!futureLength || unsaved}
  >
    <i class="bi bi-arrow-clockwise text-2xl transition-all"></i>
  </button>
</form>
