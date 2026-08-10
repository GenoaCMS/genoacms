<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children?: Snippet
  }
  const { children }: Props = $props()
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  {@render children?.()}
</div>
