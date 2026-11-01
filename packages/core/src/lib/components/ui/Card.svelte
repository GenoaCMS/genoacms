<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  interface Props extends HTMLAttributes<HTMLDivElement> {
    size?: string
    class?: string
    children?: Snippet
  }

  const { class: className = '', children, ...rest }: Props = $props()
</script>

<div class="card bg-surface-50-950 border border-surface-200-800 p-4 {className}" {...rest}>
  {@render children?.()}
</div>
