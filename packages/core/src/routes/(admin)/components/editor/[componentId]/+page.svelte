<script lang="ts">
  import type { PageData } from './$types'
  import ComponentBodyEditor from './ComponentBodyEditor.svelte'

  const { data }: { data: PageData } = $props()
</script>

<!--
  Keyed on the loaded definition so that undo and redo are visible.

  Both are form actions that revalidate, so `load` re-runs and returns a different definition object.
  The editor holds a working copy in `$state`, which is initialized once and would otherwise keep
  displaying the body from before the undo — the storage would be correct and the screen would not.
  The registrar's route is keyed the same way, for the same reason.
-->
{#key data.componentDefinition}
  <ComponentBodyEditor
    component={data.component}
    definition={data.componentDefinition}
    signature={data.signature}
    historyLength={data.historyLength}
    futureLength={data.futureLength}
  />
{/key}
