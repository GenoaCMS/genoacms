<script lang="ts">
  import type { ComponentNode } from '$lib/script/components/page/entry/types'
  import Attribute from './Attribute.svelte'

  interface Props {
    node: ComponentNode
  }
  let { node = $bindable() }: Props = $props()
  const attributeArray = $derived(Object.values(node.data))

  function updateAttribute (uid, value) {
    node.data[uid].value = value
  }
</script>

<div>
    <h2>
        {node.name}
    </h2>
    <div>
        {#each attributeArray as attribute (attribute.uid)}
            <Attribute {attribute} onupdate={updateAttribute}/>
        {/each}
    </div>
</div>
