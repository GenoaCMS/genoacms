<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  interface Props extends HTMLAttributes<HTMLParagraphElement> {
    class?: string
    children?: Snippet
  }

  const { class: className = '', children, ...rest }: Props = $props()
</script>

<p class="text-sm text-surface-600-400 mt-2 {className}" {...rest}>
  {@render children?.()}
</p>
