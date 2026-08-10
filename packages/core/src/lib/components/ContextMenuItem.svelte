<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    onclick?: () => void,
    children?: Snippet
  }
  const { onclick = () => {}, children, ...restProps }: Props = $props()
</script>

<div>
  <button {onclick} class="w-full border-b p-2" {...restProps}>
    {@render children?.()}
  </button>
</div>
