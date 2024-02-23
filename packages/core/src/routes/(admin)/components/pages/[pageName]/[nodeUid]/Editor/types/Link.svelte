<script lang="ts">
  import type { AttributeData, LinkAttributeValue } from '$lib/script/components/page/entry/types'
  import { Card, Input, Select, Toggle } from 'flowbite-svelte'
  import { page } from '$app/stores'

  export let data: AttributeData<LinkAttributeValue>
</script>

<Card>
    <div class="flex justify-around items-center px-3 pb-3">
        <div class="w-auto">
            Local
        </div>
        <Toggle bind:checked={data.value.isExternal} class="w-auto"/>
        <div class="w-auto">
            External
        </div>
    </div>
    {#if data.value.isExternal}
        <Input type="url" bind:value={data.value.url} placeholder="https://example.com" />
    {:else}
        <Select bind:value={data.value.pageName}>
            {#each $page.data.pages as pageName}
                <option value={pageName}>{pageName}</option>
            {/each}
        </Select>
    {/if}
</Card>
