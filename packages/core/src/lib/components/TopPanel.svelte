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

<div class="@container sticky top-0 z-10 bg-surface-50-950/90 backdrop-blur-md border-b border-surface-200-800 p-3">
    <div class="flex flex-wrap @min-[44rem]:flex-nowrap items-center gap-y-1">
        <div class="order-1 flex-grow min-w-0 *:truncate">
            {@render children?.()}
        </div>
        {#if right}
            <div class="order-3 @min-[44rem]:order-2 flex w-full @min-[44rem]:w-auto h-full shrink-0 overflow-x-auto">
                <div class="flex h-full ms-auto @max-[44rem]:[&_:is(button,a)]:px-2">
                    {@render right()}
                </div>
            </div>
        {/if}
        <div class="order-2 @min-[44rem]:order-3 aspect-square flex shrink-0">
            <a href={hrefBack} {onclick} aria-label="Back">
                <i class="bi bi-arrow-left-short text-4xl md:text-5xl text-warning-800-200 min-h-[2.5rem]"></i>
            </a>
        </div>
    </div>
</div>
