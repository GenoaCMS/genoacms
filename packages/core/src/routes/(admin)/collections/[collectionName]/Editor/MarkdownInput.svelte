<script lang="ts">
  import type { MarkdownValue, Errors } from './types'
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'

  type Props = {
    value: MarkdownValue,
    errors: Errors,
    onvalue: (e: MarkdownValue) => void
  }
  const { value, errors, onvalue }: Props = $props()
  let v = $state(value)
  $effect(() => onvalue(v))
</script>

<div class="w-full min-h-[15rem] flex border">
  <div class="w-1/2">
    <MonacoEditor language="markdown" bind:value={v}/>
  </div>
  <div class="w-1/2">
    <MarkdownViewer markdown={v}/>
  </div>
</div>
