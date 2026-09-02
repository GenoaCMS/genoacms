<script lang="ts">
  import CodeEditor from '$lib/components/ui/CodeEditor.svelte'

  /**
   * The code surface, and nothing else.
   *
   * **It no longer saves.** It used to write the draft a second after typing stopped, which is why
   * this component owned a hidden form and a timer. Autosaving meant there was no unsaved state and
   * so nothing for undo to step through: every burst of typing became a stored revision nobody
   * chose, and an author could not mark a point worth returning to. Saving is now an act, performed
   * by the control in the panel, and this component is left doing the one thing it is named for.
   */
  type Highlighting = 'markdown' | 'javascript' | 'typescript'
  const HIGHLIGHTING: Highlighting[] = ['markdown', 'javascript', 'typescript']

  interface Props {
    code?: string;
    /** The component's language, as it records it. Any adapter may define one. */
    language: string;
  }
  let { code = $bindable(''), language }: Props = $props()

  /**
   * Highlighting is cosmetic, so a language the editor does not know is shown as TypeScript rather
   * than not shown at all. The set of languages a component may be written in is open — adapters
   * define it — while the set this editor can color is fixed.
   */
  const highlighting = $derived(
    HIGHLIGHTING.includes(language as Highlighting) ? language as Highlighting : 'typescript'
  )
</script>

<div class="flex w-full h-[93%]">
  <CodeEditor language={highlighting} bind:value={code} />
</div>
