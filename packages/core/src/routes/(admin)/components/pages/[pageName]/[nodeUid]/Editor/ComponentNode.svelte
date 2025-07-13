<script lang="ts">
  import type { AttributeData, ComponentNode } from '$lib/script/components/page/entry/types'
  import { page } from '$app/state'
  import Attribute from './Attribute.svelte'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  interface Props {
    node: ComponentNode,
    onupdate: (uid: string, val: AttributeData<never>['value']) => void
  }
  let { node = $bindable(), onupdate }: Props = $props()
  const attributeArray = $derived(Object.values(node.data))
  const componentEntry = $derived(page.data.page.contents.nodes[node.entryReference])
$inspect(node, componentEntry)
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
  </div>
    <div>
        {#each attributeArray as attribute (attribute.uid)}
          <Attribute {attribute} {onupdate}/>
        {/each}
    </div>
</div>
