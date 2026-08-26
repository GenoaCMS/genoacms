<script lang="ts">
  /**
   * The way from a component's code back to its description.
   *
   * The counterpart of the registrar's `CodeLink`, and it exists because the two surfaces were split
   * by what they are *for* rather than by what a component is: the shape an author writes against is
   * authored there, and so is publishing. Without a way back, an author who noticed a missing
   * attribute while writing the body would have to navigate by hand to the page that owns it.
   */
  import { resolve } from '$app/paths'

  const { uid }: { uid: string } = $props()
</script>

<a
  class="h-full flex items-center px-3 cursor-pointer"
  href={resolve(`/components/registrar/${uid}`)}
  aria-label="Edit the description"
  title="Edit the description and publish"
>
  <i class="bi bi-card-list text-2xl hover:text-primary-500 transition-all"></i>
</a>
