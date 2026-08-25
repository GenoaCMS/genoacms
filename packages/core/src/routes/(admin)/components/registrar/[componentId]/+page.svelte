<script lang="ts">
  import ComponentHeaderEditor from './ComponentHeaderEditor.svelte'

  const { data } = $props()
</script>

<!--
  Keyed on the loaded entry so that undo and redo are visible.

  Both are form actions that redirect, so `load` re-runs and returns a different entry object. The
  editor holds a working copy in `$state`, which is initialized once and would otherwise keep
  displaying the state from before the undo — the storage would be correct and the screen would not.
-->
{#key data.componentHeader}
  <ComponentHeaderEditor
    id={data.id}
    entry={data.componentHeader}
    historyLength={data.historyLength}
    futureLength={data.futureLength}
  />
{/key}
