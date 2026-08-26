<script lang="ts">
  import { beforeNavigate } from '$app/navigation'

  /**
   * Warns before work in progress is thrown away.
   *
   * Renders nothing. It exists as a component rather than a function because it needs a lifecycle:
   * `beforeNavigate` must be registered during initialization, and the `beforeunload` listener has
   * to be removed when the page is torn down.
   *
   * Two exits, and they need different mechanisms:
   *
   * - **Navigating inside the CMS** — clicking any link, or the browser's back button. Caught by
   *   `beforeNavigate`, which can cancel.
   * - **Leaving the browser page** — closing the tab, reloading, following an external link. The
   *   navigation cannot be cancelled from script at all; the platform only allows *asking the
   *   browser* to prompt, which `beforeunload` does. The browser writes the wording itself and
   *   ignores anything supplied, so `message` applies only to the first case.
   *
   * ## Why the native dialog and not the CMS's own modal
   *
   * `ConfirmAlert` resolves a promise, and `beforeNavigate` cannot wait for one — a callback that
   * returns without cancelling has already allowed the navigation. Cancelling first and re-issuing
   * the navigation afterwards would work for links and **break the back button**, which cannot be
   * re-issued as a forward `goto` without corrupting history. A guard that fails on the one exit
   * people take by reflex is worse than a plain-looking dialog, so the dialog is plain.
   */
  interface Props {
    /** Whether there is anything to lose. Nothing is guarded while this is false. */
    dirty: boolean
    message?: string
  }
  const {
    dirty,
    message = 'You have unsaved changes. Leave this page and discard them?'
  }: Props = $props()

  beforeNavigate((navigation) => {
    if (!dirty) return
    // A browser-level exit reaches here too, but cannot be cancelled — the listener below is what
    // covers it, and prompting twice for one departure would be worse than not prompting here.
    if (navigation.willUnload) return
    if (!window.confirm(message)) navigation.cancel()
  })

  $effect(() => {
    if (!dirty) return

    const warn = (event: BeforeUnloadEvent): void => {
      // Calling `preventDefault` is the whole of the modern API. Setting `returnValue` or returning
      // a string is the older form and is ignored, so nothing here tries to word the prompt.
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  })
</script>
