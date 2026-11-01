<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  interface Props extends HTMLAttributes<HTMLDivElement> {
    children?: Snippet
  }
  const { children, ...restProps }: Props = $props()
</script>

<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" {...restProps}>
  {@render children?.()}
</div>
