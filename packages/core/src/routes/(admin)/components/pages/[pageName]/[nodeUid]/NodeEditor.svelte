<script lang="ts">
  import type { SubmitFunction } from '@sveltejs/kit'
  import type { AttributeValue } from '$lib/script/components/componentHeader/attribute/types'
  import type { ComponentNode as Node } from '$lib/script/components/page/entry/types'
  import ComponentNode from './Editor/ComponentNode.svelte'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'

  /**
   * Editing one node of a page, and the forms the top panel's buttons submit.
   *
   * Split out of the route so the route can **key it on the loaded node**. This holds a working copy
   * in `$state`, which is initialized once — so after an undo the storage was correct and the screen
   * went on showing the tree from before it. The component editor was keyed for the same reason and
   * carries the same note.
   *
   * The forms live here rather than in the layout because they carry this working copy. The buttons
   * that submit them are in the layout, associated by `form=` — a page's top panel belongs to the
   * page, and the thing being saved belongs to the node.
   */
  const { node }: { node: Node } = $props()

  const currentNode = $state(node)

  /**
   * Runs a page action behind the pending alert, and **always takes the alert down again**.
   *
   * `alertPending` returns a handle whose `close` was never called here. The alert is a
   * `fixed inset-0` backdrop, so every save, undo and redo left an overlay covering the editor that
   * nothing could dismiss — the page had to be reloaded to touch anything again.
   *
   * It was also disguising the state of three defects and inventing a passing test: *"redo"* timed
   * out on a button the overlay was covering, and *"undo"* **passed** because it asserted only that
   * the tree differed from where it started, and an inert page reads back as empty strings.
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
        // The reason, not just the verb. A bare "Redo failed" is what an author saw whether the
        // server refused, threw, or was never reached — three faults with three different fixes.
        const reason = result.type === 'error'
          ? result.error?.message
          : result.type === 'failure'
            ? String((result.data as Record<string, unknown> | undefined)?.reason ?? '')
            : ''
        toastError(reason ? `${failed}: ${reason}` : failed)
        return
      }
      if (reload) await invalidateAll()
      toastSuccess(succeeded)
    }
  }

  const enhanceUpdate = enhanceAction('Saving', 'Saved', 'Error saving')
  // Undo and redo change what the server holds without navigating, so the editor is re-fetched — and
  // the route's `{#key}` is what turns that re-fetch into a screen that has actually changed.
  const enhanceUndo = enhanceAction('Undoing', 'Undid', 'Undo failed', true)
  const enhanceRedo = enhanceAction('Redoing', 'Redid', 'Redo failed', true)

  function updateAttribute (uid: string, value: AttributeValue) {
    currentNode.data[uid].value = value
  }
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
