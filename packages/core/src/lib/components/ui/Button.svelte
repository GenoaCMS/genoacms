<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    preset?: 'filled' | 'tonal' | 'outlined'
    class?: string
    children?: Snippet
    [key: string]: any
  }

  const {
    preset = 'filled',
    class: className = '',
    children,
    ...rest
  }: Props = $props()

  function getPresetClass (p: string) {
    if (className.includes('preset-')) return '' // If class overrides the preset colors
    if (p === 'filled') return 'preset-filled-primary-500'
    if (p === 'tonal') return 'preset-tonal-surface'
    if (p === 'outlined') return 'preset-outlined-surface-300-700'
    return 'preset-filled-primary-500'
  }
</script>

{#if rest.href}
  <a class="btn {getPresetClass(preset)} {className}" {...rest}>
    {@render children?.()}
  </a>
{:else}
  <button class="btn {getPresetClass(preset)} {className}" {...rest}>
    {@render children?.()}
  </button>
{/if}
