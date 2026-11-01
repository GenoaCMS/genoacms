<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLAttributes } from 'svelte/elements'
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte'

    interface Props extends HTMLAttributes<HTMLDivElement> {
      class?: string
      children?: Snippet
    }

    const {
      class: className = '',
      children,
      ...rest
    }: Props = $props()
    let open = $state(false)

    function closeMenu (e: Event) {
      if ((e.target as HTMLElement).closest('.dropdown-item')) {
        open = false
      }
    }
</script>

<Popover
  {open}
  onOpenChange={(e) => {
    open = e.open
  }}
>
  <Popover.Trigger class="inline-block">
    <button
      aria-label="Open menu"
      type="button"
      class="m-3">
      <i class="bi bi-three-dots-vertical text-2xl m-auto"></i>
    </button>
  </Popover.Trigger>
  <Portal>
    <Popover.Positioner class="z-[150]">
      <Popover.Content
        class="card preset-filled-surface-50-950 border border-surface-200-800 shadow-xl {className}"
        onclick={closeMenu}
        {...rest}
      >
        <Popover.Arrow />
        <div class="p-1 flex flex-col gap-1 dropdown-item">
          {@render children?.()}
        </div>
      </Popover.Content>
    </Popover.Positioner>
  </Portal>
</Popover>
