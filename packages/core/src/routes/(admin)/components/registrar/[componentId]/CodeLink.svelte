<script lang="ts">
  /**
   * The way from a component's description to its code.
   *
   * Shown only for a component authored in the CMS — a component whose code lives in the consuming
   * application has none for the CMS to open. The registrar describes both kinds identically, so
   * this is the one place the two differ on screen, and it says what the difference *is* rather than
   * labelling the component with a word from the CMS's vocabulary.
   */
  import { resolve } from '$app/paths'

  const { id }: { id: string } = $props()
</script>

<a
  class="h-full flex items-center px-3 cursor-pointer"
  href={resolve(`/components/editor/${id}`)}
  aria-label="Edit the code"
  title="Edit the code"
>
  <i class="bi bi-code-square text-2xl hover:text-primary-500 transition-all"></i>
</a>
