<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    class?: string
    children?: Snippet
    [key: string]: any
  }

  const { class: className = '', children, ...rest }: Props = $props()
</script>

<p class="text-sm text-surface-500 mt-2 {className}" {...rest}>
  {@render children?.()}
</p>
