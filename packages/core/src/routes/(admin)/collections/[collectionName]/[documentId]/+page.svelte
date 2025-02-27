<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import Delete from './Delete.svelte'
  import Update from './Update.svelte'
  import Editor from '../Editor/Editor.svelte'

  const { data } = $props()
</script>

<TopPanel>
  <h1 class="text-2xl flex flex-wrap">
    <span class="me-2">Update</span>
    <span class="text-warning inline-block truncate max-w-[5ch]">{data.document.reference.id}</span>
    <span class="me-2">of</span>
    <span class="text-warning">{data.document.reference.collection.name}</span>
  </h1>
  <svelte:fragment slot="right">
    <Delete />
    <Update />
  </svelte:fragment>
</TopPanel>

<Editor
  editorForm={data.form}
  schema={data.document.reference.collection.schema}
  action="?/update"
/>
