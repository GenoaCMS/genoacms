<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    class?: string
    children?: Snippet
    [key: string]: any
  }

  const { class: className = '', children, ...rest }: Props = $props()
</script>

<div class="card bg-surface-50-950 border border-surface-100-900 p-4 {className}" {...rest}>
  {@render children?.()}
</div>
