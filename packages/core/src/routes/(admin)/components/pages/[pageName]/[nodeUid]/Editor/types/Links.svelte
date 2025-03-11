<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { LinkAttributeType } from '$lib/script/components/componentEntry/component/types'
  import type { LinkAttributeValue } from '$lib/script/components/componentEntry/attribute/types'
  import Link from './Link.svelte'
  import { Card } from 'flowbite-svelte'

  interface Props {
    data: AttributeData<LinkAttributeType>,
    onvalue: (v: LinkAttributeType) => void
  }
  const { data, onvalue }: Props = $props()
  const links = $state(data.value)
  const showAddLink = $derived(!data.schema.maxItems || links.length < data.schema.maxItems)

  function addLink () {
    const linkValue: LinkAttributeValue = { isExternal: false, pageName: '', url: '' }
    links.push(linkValue)
    onvalue(links)
  }

  function updateLink (index: number, link: LinkAttributeValue) {
    links[index] = link
    onvalue(links)
  }
</script>

<Card size="none" padding="sm">
  <h3 class="text-xl pb-3">
    {data.name}
  </h3>
  {#each links as link, i}
    <Link data={link} onvalue={(v) => updateLink(i, v)} />
    {#if i < links.length - 1}
      <hr class="my-4" />
    {/if}
  {/each}
  {#if showAddLink}
    <button class="mt-4" onclick={addLink} aria-label="Add link">
      <i class="bi bi-plus-circle text-4xl"></i>
    </button>
  {/if}
</Card>
