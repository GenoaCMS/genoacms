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

<div class="sticky top-0 flex items-center bg-dark text-light p-3">
    <div class="flex-grow">
        {@render children?.()}
    </div>
    <div class="flex h-full">
        {@render right?.()}
    </div>
    <div class="aspect-square flex">
        <a href={hrefBack} {onclick} aria-label="Back">
            <i class="bi bi-arrow-left-short text-5xl text-warning min-h-[2.5rem]"></i>
        </a>
    </div>
</div>
