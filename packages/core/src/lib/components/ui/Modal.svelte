<script lang="ts">
    import type { Snippet } from 'svelte'
    import { Dialog } from '@skeletonlabs/skeleton-svelte'

    interface Props {
      open: boolean
      title?: string
      size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
      class?: string
      children?: Snippet
      onclose?: () => void
    }

    let {
      open = $bindable(false),
      title,
      size = 'md',
      class: className = '',
      children,
      onclose,
    }: Props = $props()

    const sizeClass = $derived(
      size === 'xl'
        ? 'max-w-5xl'
        : size === 'lg'
          ? 'max-w-3xl'
          : size === 'md'
            ? 'max-w-xl'
            : size === 'sm'
              ? 'max-w-md'
              : 'max-w-sm'
    )
</script>

<Dialog
    {open}
    onOpenChange={(e: any) => {
      open = e.open
      if (!e.open && onclose) onclose()
    }}
>
    <Dialog.Backdrop
        class="fixed inset-0 z-[100] bg-surface-900-50/50 backdrop-blur-sm"
    />
    <Dialog.Positioner
        class="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
        <Dialog.Content
            class="card preset-filled-surface-50-950 p-6 w-full {sizeClass} shadow-xl relative max-h-[90vh] overflow-y-auto {className}"
        >
            <Dialog.CloseTrigger
                class="absolute top-4 right-4 text-surface-500 hover:text-surface-900 bg-transparent rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
                aria-label="Close"
            >
                <i class="bi bi-x-lg"></i>
            </Dialog.CloseTrigger>
            {#if title}
                <Dialog.Title class="h3 font-semibold mb-4 pr-8"
                    >{title}</Dialog.Title
                >
            {/if}
            <Dialog.Description class="space-y-4">
                {@render children?.()}
            </Dialog.Description>
        </Dialog.Content>
    </Dialog.Positioner>
</Dialog>
