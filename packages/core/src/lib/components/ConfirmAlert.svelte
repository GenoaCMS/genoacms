<script lang="ts">
    import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'
    import { confirmAlertState } from '$lib/script/alert.svelte'

    function handleChoice (isConfirmed: boolean) {
      if (confirmAlertState.resolve) {
        confirmAlertState.resolve({ isConfirmed })
      }
      confirmAlertState.isOpen = false
    }
</script>

<Dialog
    open={confirmAlertState.isOpen}
    onOpenChange={(e) => (confirmAlertState.isOpen = e.open)}
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
                class="card bg-surface-100-900 w-full max-w-md p-6 space-y-4 shadow-xl text-center"
            >
                <header>
                    <Dialog.Title class="text-xl font-bold"
                        >Are you sure?</Dialog.Title
                    >
                </header>
                <Dialog.Description class="opacity-80">
                    {confirmAlertState.message}
                </Dialog.Description>
                <footer class="flex justify-center gap-4 mt-6">
                    <button
                        type="button"
                        class="btn preset-tonal hover:shadow"
                        onclick={() => handleChoice(false)}>No</button
                    >
                    <button
                        type="button"
                        class="btn preset-filled hover:shadow"
                        onclick={() => handleChoice(true)}>Yes</button
                    >
                </footer>
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>
