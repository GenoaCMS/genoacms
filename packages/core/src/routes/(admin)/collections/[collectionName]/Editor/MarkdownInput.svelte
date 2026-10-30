<script lang="ts">
  import type { MarkdownValue } from '#lib/components/editors/types.js'
  import CodeEditor from '#lib/components/ui/CodeEditor.svelte'
  import MarkdownViewer from '#lib/components/MarkdownViewer.svelte'

  interface Props {
    value: MarkdownValue
    onvalue: (e: MarkdownValue) => void
  }
  let { value = '', onvalue }: Props = $props()

  $effect(() => {
    onvalue(value)
  })
</script>

<div class="grid @2xl:grid-cols-2 min-h-[15rem] rounded-container border border-surface-200-800 overflow-hidden">
  <div class="min-w-0">
    <CodeEditor language="markdown" bind:value />
  </div>
  <div class="min-w-0 border-t @2xl:border-t-0 @2xl:border-s border-surface-200-800">
    <div class="px-4 pt-2 text-[0.7rem] uppercase tracking-wide text-surface-600-400">Preview</div>
    <div class="px-4 pb-4 [&_.markdown-body]:bg-transparent! [&_.markdown-body]:text-inherit!">
      <MarkdownViewer markdown={value} />
    </div>
  </div>
</div>
