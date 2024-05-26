<script lang="ts">
  import type {
    AttributeData
  } from '$lib/script/components/page/entry/types'
  import type { StorageResourceAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Card } from 'flowbite-svelte'
  import { page } from '$app/stores'
  import { ITC } from '$lib/script/utils'
  import { onDestroy } from 'svelte' 

  export let data: AttributeData<StorageResourceAttributeType>
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)

  const buildSelectURL = (selectionId) => {
    return `/storage?selectionId=${selectionId}`
  }

  itc.on('storageReady', async () => {
    itc.send('parameters', {
      maxItems: 1,
      selection: isSelected ? [data.value] : undefined
    })
    const selection = await itc.once('submit')
    if (selection.length < 1) return
    data.value = selection[0]
    itc.send('done')
  })

  onDestroy(() => {
    itc.close()
  })
  $: selectHref = buildSelectURL(selectionId)
  $: isSelected = data.value.bucket && data.value.name
</script>

<Card href={selectHref} target="_blank" padding="sm">
    <h3 class="text-xl pb-3">
        {data.name}
    </h3>
    {#if isSelected}
        Bucket: {data.value.bucket}<br>
        Filename: {data.value.name}
    {:else}
        File not selected yet
    {/if}
</Card>
