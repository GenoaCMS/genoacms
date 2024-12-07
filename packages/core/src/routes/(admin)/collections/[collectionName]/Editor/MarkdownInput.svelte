<script lang="ts">
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'

  type Props = {
    name: string
    value: string
  }
  let { name, value = $bindable('') }: Props = $props()
</script>

<input type="hidden" {name} bind:value/>
<div class="w-full min-h-[15rem] flex border">
  <div class="w-1/2">
    <MonacoEditor bind:value/>
  </div>
  <div class="w-1/2">
    <MarkdownViewer markdown={value}/>
  </div>
</div>
