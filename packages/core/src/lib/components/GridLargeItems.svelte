<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children?: Snippet
    [key: string]: any
  }
  const { children, ...restProps }: Props = $props()
</script>

<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" {...restProps}>
  {@render children?.()}
</div>
