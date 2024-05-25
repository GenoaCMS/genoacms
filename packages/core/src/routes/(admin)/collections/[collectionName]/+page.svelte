<script lang="ts">
    import Document from './Document.svelte'
    import Header from './Header.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'
    import NewDocument from './NewDocument.svelte'

    export let data
</script>
<TopPanel>
  <h1 class="text-2xl">
    Collection: {data.collectionReference.name}
  </h1>
  <svelte:fragment slot="right">
    <NewDocument collectionReference={data.collectionReference}/>
  </svelte:fragment>
</TopPanel>
<Header schema={data.collectionReference.schema}/>
{#each data.documents as documentSnap}
    <Document {...documentSnap}/>
{/each}
