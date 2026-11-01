<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements'

  interface OwnProps {
    preset?: 'filled' | 'tonal' | 'outlined'
    class?: string
    children?: Snippet
  }

  type Props = OwnProps & HTMLButtonAttributes & HTMLAnchorAttributes

  const {
    preset = 'filled',
    class: className = '',
    children,
    ...rest
  }: Props = $props()

  function getPresetClass (p: string) {
    if (className.includes('preset-')) return '' // If class overrides the preset colors
    if (p === 'filled') return 'preset-filled-primary-500'
    if (p === 'tonal') return 'preset-tonal'
    if (p === 'outlined') return 'preset-outlined-surface-200-800 hover:preset-tonal'
    return 'preset-filled-primary-500'
  }
</script>

{#if rest.href}
  <a class="btn cursor-pointer {getPresetClass(preset)} {className}" {...rest}>
    {@render children?.()}
  </a>
{:else}
  <button class="btn cursor-pointer {getPresetClass(preset)} {className}" {...rest}>
    {@render children?.()}
  </button>
{/if}
