<script lang="ts">
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'

  export let name: string
  export let value: string
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
