<script lang="ts">
  import type { AttributeData, ComponentNode } from '$lib/script/components/page/entry/types'
  import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'
  import { page } from '$app/state'
  import Attribute from './Attribute.svelte'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'
  import { Button } from 'flowbite-svelte'

  interface Props {
    node: ComponentNode,
    onupdate: (uid: string, val: AttributeData<never>['value']) => void
  }
  let { node = $bindable(), onupdate }: Props = $props()
  const componentEntry: ComponentEntry = $derived(page.data.componentSchemas.find(i => i.uid === node.entryReference))
  const componentEntryURL = $derived(componentEntry.type === 'coded' ? `/components/editor/${componentEntry.uid}` : `/components/prebuilt/${componentEntry.uid}`)
</script>

<div>
  <div class="flex gap-2 items-center py-3">
    <div class="me-3">
      <AttributeTypeIcon type="components" />
    </div>
    <h3 class="text-2xl font-bold">
      {node.name}
    </h3>
    <span class="text-sm text-dark/70">
      #{node.uid.substring(0, 5)}
    </span>
  <div class="ms-auto">
    <Button href={componentEntryURL} target="_blank" color="light" class="cursor-pointer">
      Go to component
    </Button>
  </div>
  </div>
    <div>
        {#each componentEntry.attributeOrder as attributeUid (attributeUid)}
          {@const attribute = node.data[attributeUid]}
          <Attribute {attribute} {onupdate}/>
        {/each}
    </div>
</div>
