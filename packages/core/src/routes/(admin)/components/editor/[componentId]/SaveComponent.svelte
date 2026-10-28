<script lang="ts">
  import { saveComponentRemote } from './save.remote.js'
  import { toastError, toastSuccess } from '$lib/script/alert.svelte'

  /**
   * Writes the draft, and reports the history it produced.
   *
   * The floppy icon and its place in the panel are the registrar's, so the two editors save the same
   * way. It carries the **unsaved** marker because this is the control that clears it: a dot on the
   * one button that would act on it is a smaller thing to notice than a banner, and it is where an
   * author already looks when they wonder whether their work is safe.
   */
  interface Props {
    uid: string;
    body: string;
    unsaved: boolean;
    /** HIS-2: the version this save is based on. */
    version: string;
    /** Called with the resulting depth and version, so the history controls answer without a reload. */
    onsaved: (saved: { historyLength: number, futureLength: number, version: string }) => void;
  }
  const { uid, body, unsaved, version, onsaved }: Props = $props()

  const CONFLICT = 'Changed elsewhere. Reload to see the latest version.'

  const enhance = saveComponentRemote.enhance(async ({ submit }) => {
    try {
      await submit()
      const result = saveComponentRemote.result
      if (result === undefined || result.status !== 'success') {
        const text = result?.text ?? 'The save was refused, and gave no reason'
        toastError(text.startsWith('conflict/modified-since') ? CONFLICT : text)
        return
      }
      toastSuccess(result.text)
      onsaved({
        historyLength: result.historyLength as number,
        futureLength: result.futureLength as number,
        version: result.version as string
      })
    } catch (error) {
      toastError(error instanceof Error ? error.message : String(error))
    }
  })
</script>

<form {...enhance} class="h-full" enctype="multipart/form-data">
  <input type="hidden" name="uid" value={uid} />
  <input type="hidden" name="body" value={body} />
  <input type="hidden" name="version" value={version} />
  <button
    type="submit"
    aria-label="Save"
    title={unsaved ? 'Save (unsaved changes)' : 'Save'}
    class="h-full flex items-center px-3 cursor-pointer relative"
  >
    <i class="bi bi-floppy text-2xl hover:text-warning transition-all"></i>
    {#if unsaved}
      <!-- Marked rather than announced. The state is continuous — it is true for as long as the
           author keeps typing — so anything that interrupted would interrupt constantly. -->
      <span
        class="absolute top-1 right-1 w-2 h-2 rounded-full bg-warning-500"
        aria-hidden="true"
      ></span>
    {/if}
  </button>
</form>
