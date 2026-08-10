<script lang="ts">
    import Document from './Document.svelte'
    import Header from './Header.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'
    import NewDocument from './NewDocument.svelte'
    import ConfirmSelection from './ConfirmSelection.svelte'

    const { data } = $props()
</script>
<TopPanel>
  <h1 class="text-2xl">
    Collection: {data.collectionReference.name}
  </h1>
  {#snippet right()}
    <ConfirmSelection />
    <NewDocument collectionReference={data.collectionReference}/>
  {/snippet}
</TopPanel>
<Header collectionReference={data.collectionReference}/>
{#each data.documents as documentSnap}
    <Document {...documentSnap}/>
{/each}
