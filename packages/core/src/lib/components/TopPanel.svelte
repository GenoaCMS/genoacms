<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet,
    right?: Snippet
    hrefBack?: string,
    onclick?: (event: MouseEvent) => void
  }
  const { children, right, hrefBack = '.', onclick = () => {} }: Props = $props()
</script>

<div class="sticky top-0 z-10 flex items-center bg-surface-50-950/90 backdrop-blur-md border-b border-surface-200-800 p-3">
    <div class="flex-grow min-w-0">
        {@render children?.()}
    </div>
    <div class="flex h-full shrink-0">
        {@render right?.()}
    </div>
    <div class="aspect-square flex shrink-0">
        <a href={hrefBack} {onclick} aria-label="Back">
            <i class="bi bi-arrow-left-short text-4xl md:text-5xl text-warning-800-200 min-h-[2.5rem]"></i>
        </a>
    </div>
</div>
