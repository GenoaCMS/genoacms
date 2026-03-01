<script lang="ts">
    import type { Snippet } from 'svelte'
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte'

    interface Props {
      class?: string
      children?: Snippet
      [key: string]: any
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
  onOpenChange={(e: any) => {
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
    <Popover.Positioner>
      <Popover.Content
        class="card preset-filled-surface-100-900 shadow-lg {className}"
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
