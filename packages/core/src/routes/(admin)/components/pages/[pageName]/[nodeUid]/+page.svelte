<script lang="ts">
    import type { SubmitFunction } from '@sveltejs/kit'
    import type { AttributeValue } from '$lib/script/components/componentHeader/attribute/types'
    import ComponentNode from './Editor/ComponentNode.svelte'
    import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
    import { enhance } from '$app/forms'
    import { invalidateAll } from '$app/navigation'

    const { data } = $props()
    let currentNode = $state(data.node)
    /**
     * Runs a page action behind the pending alert, and **always takes the alert down again**.
     *
     * `alertPending` returns a handle whose `close` was never called here. The alert is a
     * `fixed inset-0` backdrop, so every save, undo and redo left an overlay covering the editor
     * that nothing could dismiss — the page had to be reloaded to touch anything again.
     *
     * **It was also disguising the state of three real defects, and inventing a passing test.**
     * Closing it does not fix undo, redo or dragging — all three remain broken — but it changes what
     * they look like: *"redo"* stopped timing out on a button the overlay was covering and now fails
     * on the assertion, and *"undo"* stopped **passing**. That test asserted only that the tree
     * differed from where it started, and an inert page under the overlay reads back as empty
     * strings, which differs from anything. Undo has most likely never worked.
     *
     * The alert closes **before** the result is inspected, so a refusal takes it down too. Closing
     * inside the success branch would leave the overlay up exactly when something had gone wrong and
     * the author most needs to read the error behind it.
     */
    const enhanceAction = (
      pending: string,
      succeeded: string,
      failed: string,
      reload = false
    ): SubmitFunction => () => {
      const alert = alertPending(pending)
      return async ({ result }) => {
        alert.close()
        if (result.type !== 'success') {
          toastError(failed)
          return
        }
        if (reload) await invalidateAll()
        toastSuccess(succeeded)
      }
    }

    const enhanceUpdate = enhanceAction('Saving', 'Saved', 'Error saving')
    // Undo and redo change what the server holds without navigating, so the editor is re-fetched.
    const enhanceUndo = enhanceAction('Undoing', 'Undid', 'Undo failed', true)
    const enhanceRedo = enhanceAction('Redoing', 'Redid', 'Redo failed', true)
    function updateAttribute (uid: string, value: AttributeValue) {
      currentNode.data[uid].value = value
    }
    $effect(() => {
      currentNode = data.node
    })
</script>

<div class="h-full flex flex-col p-4">
  <div class="flex-grow">
    <ComponentNode node={currentNode} onupdate={updateAttribute}/>
  </div>
</div>

<form id="update-form" action="?/update" method="post" use:enhance={enhanceUpdate} hidden>
    <input type="text" name="componentNode" value={JSON.stringify(currentNode)} />
</form>
<form id="build-form" action="?/updateAndGenerateTree" method="post" use:enhance={enhanceUpdate} hidden>
    <input type="text" name="componentNode" value={JSON.stringify(currentNode)} />
</form>
<form id="undo-form" action="?/undo" method="post" use:enhance={enhanceUndo} hidden>
</form>
<form id="redo-form" action="?/redo" method="post" use:enhance={enhanceRedo} hidden>
</form>
