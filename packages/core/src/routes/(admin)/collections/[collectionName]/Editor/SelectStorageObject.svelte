<script lang="ts">
  import { Card } from 'flowbite-svelte'

  export let reference = ''

  export let collectionName: string
  export let documentId: string
  export let attributeName: string


  let bucket = ''
  let name = ''

  const buildSelectURL = () => {
    let url = '/storage'
    url += '?maxSelectionItems=1'
    url += '&selectionType=page-data'
    url += `&collectionName=${collectionName}`
    url += `&documentId=${documentId}`
    url += `&attributeName=${attributeName}`
    return url
  }

  $: selectHref = buildSelectURL()
  $: reference = `${name}-${bucket}`
</script>

<Card href={selectHref} padding="sm">
    {#if bucket && name}
        Bucket: {bucket}<br>
        Filename: {name}
    {:else}
        File not selected yet
    {/if}
</Card>
