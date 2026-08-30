<script lang="ts">
  import { Button, Input, Label, Modal } from '$lib/components/ui/index'
  import { publishComponentRemote } from './publish.remote.js'
  import { toastError, toastSuccess, toastWarning } from '$lib/script/alert.svelte'

  /**
   * Releasing the component: signs its header, and compiles and signs its code if it has any.
   *
   * No diff view, unlike the control this replaces. That one lived in the code editor and compared
   * two bodies; from here the component may have no body at all, and for the kind that does, what
   * publishing changes is the header *and* the code together. Showing half of that would be worse
   * than showing none of it.
   *
   * There is no local "nothing to publish" check either. The server compares the header's canonical
   * digest, the body and the emitted signature, and the first of those is not something the page can
   * compute. A control that guessed would sometimes be dead when a publication was available, which
   * is the failure worth avoiding — so it stays enabled and the server answers.
   */
  interface Props {
    componentId: string;
    /** Called with the new publication's timestamp once the server has stored it. */
    onpublished: (publishedAt: number) => void;
  }
  const { componentId, onpublished }: Props = $props()

  let isModalOpen = $state(false)
  let note = $state('')

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }

  /**
   * Publishes, and reports what the server actually said.
   *
   * A refusal comes back as a returned `{ status: 'fail' }`, not as a thrown error, and `submit()`
   * resolves to a boolean rather than to that value — so a handler that only catches reports success
   * for every refusal. Publishing runs analysis and compilation, both of which reject ordinary
   * mistakes, so the refused case is the common one.
   */
  interface Warning { rule: string, message: string, line?: number }

  /**
   * Shows what analysis reported and did not refuse.
   *
   * Separate toasts rather than one joined message: each names a different line, and a person acting
   * on them reads them one at a time.
   */
  const reportWarnings = (warnings: Warning[] | undefined) => {
    for (const warning of warnings ?? []) {
      const where = warning.line === undefined ? '' : ` (line ${warning.line})`
      toastWarning(`${warning.rule}: ${warning.message}${where}`)
    }
  }

  const enhance = publishComponentRemote.enhance(async ({ submit }) => {
    try {
      await submit()
      const result = publishComponentRemote.result
      if (result === undefined || result.status !== 'success') {
        toastError(result?.text ?? 'The publication was refused, and gave no reason')
        return
      }
      toastSuccess(result.text)
      reportWarnings(result.warnings as Warning[] | undefined)
      onpublished(result.publishedAt as number)
      isModalOpen = false
      note = ''
    } catch (error) {
      toastError(error instanceof Error ? error.message : String(error))
    }
  })
</script>

<button
  class="h-full flex items-center px-3"
  onclick={toggleModal}
  aria-label="Publish"
>
  <i class="bi bi-rocket-takeoff text-2xl hover:text-primary transition-all"></i>
</button>

<Modal title="Publish the component" bind:open={isModalOpen}>
  <div class="w-full space-y-4">
    <p class="text-sm opacity-80">
      Publishing signs this component's description so pages can be built on it. If the component has
      code, the draft is checked, compiled and signed as well.
    </p>
    <form {...enhance} class="w-full space-y-2" enctype="multipart/form-data">
      <Label class="text-sm font-medium">Publication note:</Label>
      <input type="hidden" name="componentId" value={componentId} />
      <Input
        type="text"
        name="note"
        bind:value={note}
        placeholder="Describe what you are releasing..."
        required
      />
      <Button preset="filled" class="w-full mt-4" type="submit">Publish</Button>
    </form>
  </div>
</Modal>
