<script lang="ts">
  import type { AttributeData, ComponentNode } from '$lib/script/components/page/entry/types'
  import Attribute from './Attribute.svelte'

  interface Props {
    node: ComponentNode,
    onupdate: (uid: string, val: AttributeData<never>['value']) => void
  }
  let { node = $bindable(), onupdate }: Props = $props()
  const attributeArray = $derived(Object.values(node.data))
</script>

<div>
    <h2>
        {node.name}
    </h2>
    <div>
        {#each attributeArray as attribute (attribute.uid)}
          <Attribute {attribute} {onupdate}/>
        {/each}
    </div>
</div>
