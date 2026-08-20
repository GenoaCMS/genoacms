<script lang="ts">
    import type { Snippet } from 'svelte'
    import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'

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
    <Portal>
        <Dialog.Backdrop
            class="fixed inset-0 z-[100] bg-surface-900-50/50 backdrop-blur-sm"
        />
        <Dialog.Positioner
            class="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
            <Dialog.Content
                class="card preset-filled-surface-50-950 border border-surface-200-800 p-6 w-full {sizeClass} shadow-xl relative max-h-[90vh] overflow-y-auto {className}"
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
                    <!--
                      Rendered only while open, so a closed modal has no contents in the document.

                      Skeleton keeps the children mounted otherwise, which is not merely wasteful:
                      a modal's contents almost always hold working state seeded from a prop — the
                      grant editor's rows, a role selection, a form's fields — and state seeded once
                      at mount goes stale the moment the data behind it changes. Saving a role and
                      reopening its editor showed the values it was built with until the page was
                      refreshed, and the same defect was latent in every other modal in the app.

                      Mounting on open makes "the modal shows the current state" true by
                      construction rather than by each caller remembering to re-seed. It also keeps
                      portalled content — comboboxes, diff editors — out of the document until it
                      is real, which is why several closed modals used to contribute duplicate
                      listboxes and editors to the page.
                    -->
                    {#if open}
                        {@render children?.()}
                    {/if}
                </Dialog.Description>
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>
