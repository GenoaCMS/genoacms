<script lang="ts">
    import Document from './Document.svelte'
    import Header from './Header.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'
    import NewDocument from './NewDocument.svelte'
    import ConfirmSelection from './ConfirmSelection.svelte'
    import PermissionGate from '$lib/components/PermissionGate.svelte'

    const { data } = $props()
</script>
<TopPanel>
  <h1 class="text-2xl">
    Collection: {data.collectionReference.name}
  </h1>
  {#snippet right()}
    <ConfirmSelection />
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
