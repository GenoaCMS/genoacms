<script lang="ts">
  import NodeEditor from './NodeEditor.svelte'

  const { data } = $props()
</script>

<!--
  Keyed on the loaded node so that undo and redo are visible.

  Both are form actions that revalidate, so `load` re-runs and returns a different node object. The
  editor holds a working copy in `$state`, which is initialized once and would otherwise keep
  displaying the tree from before the undo — the storage would be correct and the screen would not.
  That is exactly what it did: an undo persisted, and only a reload showed it.

  The component editor's route is keyed the same way, for the same reason, and its note said so
  before this one was written. The two surfaces had the same defect and only one of them had been
  fixed.
-->
{#key data.node}
  <NodeEditor node={data.node} />
{/key}
