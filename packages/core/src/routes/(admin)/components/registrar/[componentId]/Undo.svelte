<script lang="ts">
  import { enhance } from '$app/forms'
  interface Props {
    historyLength: number
    /** HIS-2 */
    version: string
  }
  const { historyLength, version }: Props = $props()

</script>

<!--
  `method` is not optional: a form without it sends GET, and an action only runs on POST.

  `use:enhance` is what keeps this from reloading the page. It posts in the background, then applies
  the result and revalidates, so the editor is rebuilt from the new state in place. Without
  JavaScript the same POST still works — the browser just navigates.
-->
<form action="?/undo" method="post" use:enhance>
  <input type="hidden" name="version" value={version} />
  <button
    type="submit"
    aria-label="Undo"
    class="h-full flex items-center px-3"
    class:cursor-pointer={!!historyLength}
    disabled={!historyLength}
  >
    <i class="bi bi-arrow-counterclockwise text-2xl transition-all"></i>
  </button>
</form>
