<script lang="ts">
  import type {
    AttributeData
  } from '$lib/script/components/page/entry/types'
  import { Card } from 'flowbite-svelte'
  import { ITC } from '$lib/script/utils'
  import { onDestroy } from 'svelte'
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import type { StorageResourceAttributeType } from '$lib/script/components/componentEntry/component/types'
  import type { SelectionInitData } from '$lib/script/storage/SelectionStore'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  export let data: AttributeData<StorageResourceAttributeType>
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)

  const buildSelectURL = (selectionId: string) => {
    return `/storage?selectionId=${selectionId}`
  }

  itc.on('selectionInit', async () => {
    const parameters = {
      maxItems: 1
    }
    const defaultValue = isSelected ? [data.value] : undefined
    const initData: SelectionInitData = {
      parameters,
      defaultValue
    }
    itc.send('selectionInitData', initData)
    const selection = await itc.once('selectionDone') as Array<ObjectReference>
    if (selection.length < 1) return
    data.value = selection[0]
    itc.send('selectionKill')
  })

  onDestroy(() => {
    itc.close()
  })
  $: selectHref = buildSelectURL(selectionId)
  $: isSelected = data.value.bucket && data.value.name
</script>

<Card href={selectHref} target="_blank" size="xl" class="p-4">
  <div class="flex">
    <div class="me-3">
      <AttributeTypeIcon type={data.type} />
    </div>
    <h3 class="text-xl pb-3">
      {data.name}
    </h3>
  </div>
  {#if isSelected}
    Bucket: {data.value.bucket}<br>
    Filename: {data.value.name}
  {:else}
    File not selected yet
  {/if}
</Card>
