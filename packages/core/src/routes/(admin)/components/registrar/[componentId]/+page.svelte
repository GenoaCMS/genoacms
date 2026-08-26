<script lang="ts">
  import ComponentHeaderEditor from './ComponentHeaderEditor.svelte'

  const { data } = $props()
</script>

<!--
  Keyed on the loaded header so that undo and redo are visible.

  Both are form actions that redirect, so `load` re-runs and returns a different header object. The
  editor holds a working copy in `$state`, which is initialized once and would otherwise keep
  displaying the state from before the undo — the storage would be correct and the screen would not.

  **One editor for both kinds.** A dynamic component's shape is authored here exactly as any other
  component's is; what it has in addition is code, and the way to it is a link the editor renders.
-->
{#key data.componentHeader}
  <ComponentHeaderEditor
    id={data.id}
    entry={data.componentHeader}
    historyLength={data.historyLength}
    futureLength={data.futureLength}
    publishedAt={data.publishedAt}
  />
{/key}
