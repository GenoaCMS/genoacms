<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import Delete from './Delete.svelte'
  import Update from './Update.svelte'
  import Editor from '../Editor/Editor.svelte'

  const { data } = $props()
</script>

<TopPanel>
  <h1 class="text-2xl">
    Update <span class="text-warning">{data.document.reference.id}</span> of
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
