<script lang="ts">
  import type { LinkAttributeValue } from '#lib/script/components/componentHeader/component/types.js'
  import { untrack } from 'svelte'
  import { Input, Select, Toggle } from '#lib/components/ui/index.js'

  interface Props {
    value: LinkAttributeValue,
    pages: string[],
    onvalue: (value: LinkAttributeValue) => void
  }
  const { value, pages, onvalue }: Props = $props()
  const initial = untrack(() => value)
  const draft = $state({
    isExternal: initial.isExternal,
    url: initial.isExternal ? initial.url : '',
    pageName: initial.isExternal ? '' : initial.pageName
  })

  // PGE-12
  function selectedLink (): LinkAttributeValue {
    return draft.isExternal
      ? { isExternal: true, url: draft.url }
      : { isExternal: false, pageName: draft.pageName }
  }
  function sendLink () {
    onvalue(selectedLink())
  }
  function selectKind (event: Event) {
    draft.isExternal = (event.currentTarget as HTMLInputElement).checked
    sendLink()
  }
  function updateURL (event: Event) {
    draft.url = (event.currentTarget as HTMLInputElement).value
    sendLink()
  }
  function selectPage (event: Event) {
    draft.pageName = (event.currentTarget as HTMLSelectElement).value
    sendLink()
  }
</script>

<div class="flex justify-around items-center px-3 pb-3">
  <div class="w-auto">
    Local
  </div>
  <Toggle checked={draft.isExternal} onchange={selectKind} aria-label="External" class="w-auto"/>
  <div class="w-auto">
    External
  </div>
</div>
{#if draft.isExternal}
  <Input type="url" value={draft.url} placeholder="https://example.com" oninput={updateURL} />
{:else}
  <Select value={draft.pageName} onchange={selectPage}>
    {#each pages as pageName (pageName)}
      <option value={pageName}>{pageName}</option>
    {/each}
  </Select>
{/if}
