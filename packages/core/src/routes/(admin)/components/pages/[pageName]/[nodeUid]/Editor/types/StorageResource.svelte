<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import { Card } from 'flowbite-svelte'
  import { page } from '$app/stores'

  export let data: AttributeData<string>
  const buildSelectURL = (data: AttributeData<string>) => {
    let url = '/storage'
    url += '?select='
    url += `&pageName=${$page.data.page.pageName}`
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
    {data.value || 'File not selected yet'}
</Card>
