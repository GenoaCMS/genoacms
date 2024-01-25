<script lang="ts">
    import Document from './Document.svelte'
    import Header from './Header.svelte'
    import TopPanel from '$lib/components/TopPanel.svelte'

    export let data
</script>

<TopPanel>
    <h3>
        Collection: {data.collectionReference.name}
    </h3>
</TopPanel>
<Header schema={data.collectionReference.schema}/>
{#each data.documents as documentSnap}
    <Document {...documentSnap}/>
{/each}
