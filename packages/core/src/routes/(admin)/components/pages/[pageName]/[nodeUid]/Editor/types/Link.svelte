<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { LinkAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Card, Input, Select, Toggle } from '$lib/components/ui/index'
  import { page } from '$app/state'

  interface Props {
    data: AttributeData<LinkAttributeType>,
    onvalue: (v: LinkAttributeType) => void
  }
  const { data, onvalue }: Props = $props()
  const link = $state(data)

  function selectType (e: CustomEvent<boolean>) {
    link.isExternal = e.target.checked
    onvalue(link)
  }
  function updateURL (e: InputEvent) {
    link.url = (e.target as HTMLInputElement).value
    onvalue(link)
  }
</script>

<div class="flex justify-around items-center px-3 pb-3">
  <div class="w-auto">
    Local
  </div>
  <Toggle checked={link.isExternal} onchange={selectType} class="w-auto"/>
  <div class="w-auto">
    External
  </div>
</div>
{#if link.isExternal}
  <Input type="url" value={link.url} placeholder="https://example.com" oninput={updateURL} />
{:else}
  <Select bind:value={link.pageName}>
    {#each page.data.pages as pageName}
      <option value={pageName}>{pageName}</option>
    {/each}
  </Select>
{/if}
