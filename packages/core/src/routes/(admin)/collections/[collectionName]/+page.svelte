<script lang="ts">
    import Document from './Document.svelte'
    import Header from './Header.svelte'
    import Filter from './Filter.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'
    import NewDocument from './NewDocument.svelte'
    import ConfirmSelection from './ConfirmSelection.svelte'
    import SelectAll from './SelectAll.svelte'
    import Delete from './Delete.svelte'
    import PermissionGate from '$lib/components/PermissionGate.svelte'
    import { columnsOf, cellsOf, matchesFilter, openingFilter, documentCount, minimumWidth } from './listing'

    const { data } = $props()

    let query = $derived(openingFilter(data.collectionReference.name))
    const columns = $derived(columnsOf(data.collectionReference))
    const rows = $derived(data.documents.map(document => ({
      document,
      cells: cellsOf(columns, String(document.reference.id), document.data ?? {})
    })))
    const shownRows = $derived(rows.filter(row => matchesFilter(String(row.document.reference.id), row.cells, query)))
    const shownIds = $derived(shownRows.map(row => row.document.reference.id))
    const count = $derived(documentCount(shownRows.length, rows.length, query.trim() !== ''))
</script>
<TopPanel>
  <h1 class="text-2xl">
    Collection: {data.collectionReference.name}
  </h1>
  {#snippet right()}
    <ConfirmSelection />
    <!-- Deleting is offered only to a principal who may delete here. The service refuses it
         regardless; hiding it keeps the toolbar honest about what it can do.

         **Before the select-all control, never after it.** This group is anchored to the right, so a
         control that appears extends it leftwards and every control before it shifts. Putting Delete
         after would land it exactly where "select all" had just been clicked, turning a second click
         in the same spot into a deletion. Ordered as the storage browser's toolbar is, for the same
         reason. -->
    <PermissionGate permission="db:collection:delete" resource={data.collectionReference.name}>
      <Delete />
    </PermissionGate>
    <SelectAll documentIds={shownIds} />
    <!-- Creating a document is a write on this collection, which is what the database service
         demands when the form is submitted. -->
    <PermissionGate permission="db:collection:write" resource={data.collectionReference.name}>
      <NewDocument collectionReference={data.collectionReference}/>
    </PermissionGate>
  {/snippet}
</TopPanel>
<!-- LST-1, LST-7 -->
<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
  <p class="text-sm text-surface-600-400">{count}</p>
  <Filter bind:query />
</div>
<div class="overflow-x-auto">
  <div style:min-width="calc({minimumWidth(columns)} + 2.5rem)">
    <Header {columns} />
    {#each shownRows as row (row.document.reference.id)}
      <Document reference={row.document.reference} {columns} cells={row.cells} />
    {/each}
  </div>
</div>
