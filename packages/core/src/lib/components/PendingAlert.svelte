<script lang="ts">
    import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'
    import { pendingAlertState } from '$lib/script/alert.svelte'
</script>

<Dialog
    open={pendingAlertState.isOpen}
    onOpenChange={(e) => (pendingAlertState.isOpen = e.open)}
    closeOnInteractOutside={false}
>
    <Portal>
        <Dialog.Backdrop
            class="fixed inset-0 z-50 bg-surface-50-950/20 backdrop-blur-sm"
        />
        <Dialog.Positioner
            class="fixed inset-0 z-50 flex justify-center items-center p-4"
        >
            <Dialog.Content
                class="card bg-surface-100-900 w-full max-w-sm p-8 space-y-4 shadow-xl flex flex-col items-center justify-center aspect-square"
            >
                <Dialog.Title class="text-4xl font-bold text-center"
                    >{pendingAlertState.message}</Dialog.Title
                >
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>
