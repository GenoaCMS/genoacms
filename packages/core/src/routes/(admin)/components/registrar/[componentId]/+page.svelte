<script lang="ts">
  import ComponentHeaderEditor from './ComponentHeaderEditor.svelte'
  import DynamicComponentHeader from './DynamicComponentHeader.svelte'

  const { data } = $props()
</script>

<!--
  The registrar describes both kinds of component, and the kind decides which view answers.

  A prebuilt component's description is authored here, so it gets the editor. A dynamic component's
  is derived from its source, so it is shown read-only with a link to the code — the branch is in
  the route rather than inside the editor because the two are different jobs, not one job with a
  flag, and folding them together would leave a form whose every control had to ask what it was
  editing.

  The editor is keyed on the loaded header so that undo and redo are visible: both are form actions
  that redirect, so `load` re-runs and returns a different object, while the editor holds a working
  copy in `$state` that is initialized once and would otherwise keep displaying the state from
  before the undo — the storage would be correct and the screen would not.
-->
{#if data.componentHeader.type === 'dynamic'}
  <DynamicComponentHeader id={data.id} header={data.componentHeader} />
{:else}
  {#key data.componentHeader}
    <ComponentHeaderEditor
      id={data.id}
      entry={data.componentHeader}
      historyLength={data.historyLength}
      futureLength={data.futureLength}
    />
  {/key}
{/if}
