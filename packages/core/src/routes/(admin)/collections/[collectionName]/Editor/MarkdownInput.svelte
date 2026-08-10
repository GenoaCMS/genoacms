<script lang="ts">
  import type { MarkdownValue } from './types'
  import CodeEditor from '$lib/components/ui/CodeEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'

  interface Props {
    value: MarkdownValue
    onvalue: (e: MarkdownValue) => void
  }
  let { value = '', onvalue }: Props = $props()

  $effect(() => {
    onvalue(value)
  })
</script>

<div class="w-full min-h-[15rem] flex border">
  <div class="w-1/2">
    <CodeEditor language="markdown" bind:value />
  </div>
  <div class="w-1/2">
    <MarkdownViewer markdown={value} />
  </div>
</div>
