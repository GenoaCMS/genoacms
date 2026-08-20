<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children?: Snippet
    [key: string]: any
  }
  const { children, ...restProps }: Props = $props()
</script>

<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4" {...restProps}>
  {@render children?.()}
</div>
