<script lang="ts">
    import Document from './Document.svelte'
    import Header from './Header.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'
    import NewDocument from './NewDocument.svelte'
    import ConfirmSelection from './ConfirmSelection.svelte'
    import SelectAll from './SelectAll.svelte'
    import Delete from './Delete.svelte'
    import PermissionGate from '$lib/components/PermissionGate.svelte'

    const { data } = $props()
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
    <SelectAll />
    <!-- Creating a document is a write on this collection, which is what the database service
         demands when the form is submitted. -->
    <PermissionGate permission="db:collection:write" resource={data.collectionReference.name}>
      <NewDocument collectionReference={data.collectionReference}/>
    </PermissionGate>
  {/snippet}
</TopPanel>
<Header collectionReference={data.collectionReference}/>
{#each data.documents as documentSnap}
    <Document {...documentSnap}/>
{/each}
