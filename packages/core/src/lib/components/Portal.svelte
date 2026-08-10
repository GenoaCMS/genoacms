<script lang="ts">
  import type { Snippet } from 'svelte'
  import { onMount, onDestroy } from 'svelte'

  interface Props {
    children?: Snippet,
  }
  let { children, ...restProps }: Props = $props()
  let targetElement: HTMLDivElement
  let child: HTMLDivElement

  const stackTarget = () => {
    child = document.createElement('div')
    document.body.appendChild(child)
    child.appendChild(targetElement)
  }
  const removeTarget = () => {
    if (typeof document !== 'undefined') {
      document.body.removeChild(child)
    }
  }

  onMount(stackTarget)
  onDestroy(removeTarget)
</script>

<div bind:this={targetElement} {...restProps}>
  {@render children?.()}
</div>
