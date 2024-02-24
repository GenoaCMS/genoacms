<script lang="ts">
  import type {
    AttributeData,
    StorageResourceAttributeValue
  } from '$lib/script/components/page/entry/types'
  import { Card } from 'flowbite-svelte'
  import { page } from '$app/stores'

  export let data: AttributeData<StorageResourceAttributeValue>
  const buildSelectURL = (data: AttributeData<StorageResourceAttributeValue>) => {
    let url = '/storage'
    url += '?maxSelectionItems=1'
    url += '&selectionType=page-data'
    url += `&pageName=${$page.data.page.name}`
    url += `&nodeUID=${$page.data.node.uid}`
    url += `&attributeUID=${data.uid}`
    return url
  }
  $: selectHref = buildSelectURL(data)
</script>

<Card href={selectHref} padding="sm">
    <h3 class="text-xl pb-3">
        {data.name}
    </h3>
    {#if data.value.bucket && data.value.name}
        Bucket: {data.value.bucket}<br>
        Filename: {data.value.name}
    {:else}
        File not selected yet
    {/if}
</Card>
