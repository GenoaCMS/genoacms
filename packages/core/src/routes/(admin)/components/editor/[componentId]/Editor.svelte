<script lang="ts">
  import CodeEditor from '$lib/components/ui/CodeEditor.svelte'
  import { changeComponentRemote } from './change.remote.js'

  /** The syntaxes the code editor can highlight. */
  type Highlighting = 'markdown' | 'javascript' | 'typescript'
  const HIGHLIGHTING: Highlighting[] = ['markdown', 'javascript', 'typescript']

  interface Props {
    uid: string;
    code?: string;
    /** The component's language, as it records it. Any adapter may define one. */
    language: string;
  }
  let { uid, code = $bindable(''), language }: Props = $props()

  /**
   * Highlighting is cosmetic, so a language the editor does not know is shown as TypeScript rather
   * than not shown at all. The set of languages a component may be written in is open — adapters
   * define it — while the set this editor can color is fixed.
   */
  const highlighting = $derived(
    HIGHLIGHTING.includes(language as Highlighting) ? language as Highlighting : 'typescript'
  )

  let formElement: HTMLFormElement
  let updateTimeout: ReturnType<typeof setTimeout>
  const enhance = changeComponentRemote.enhance(async ({ submit }) => {
    await submit()
  })

  function scheduleCodeUpdate (_currentCode: string) {
    clearTimeout(updateTimeout)
    updateTimeout = setTimeout(() => {
      if (formElement) formElement.requestSubmit()
    }, 1000)
  }

  $effect(() => {
    scheduleCodeUpdate(code)
  })
</script>

<div class="flex w-full h-[93%]">
  <CodeEditor language={highlighting} bind:value={code} />
</div>

<form bind:this={formElement} {...enhance} hidden>
  <input type="hidden" name="uid" value={uid} />
  <input type="hidden" name="uncommitedCode" value={code} />
</form>
