<script lang="ts">
  import type { AttributeData, ComponentNode } from '$lib/script/components/page/entry/types'
  import type { ComponentHeader } from '$lib/script/components/componentHeader/component/types'
  import { page } from '$app/state'
  import Attribute from './Attribute.svelte'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'
  import { Button, } from '$lib/components/ui/index'

  interface Props {
    node: ComponentNode,
    onupdate: (uid: string, val: AttributeData<never>['value']) => void
  }
  let { node = $bindable(), onupdate }: Props = $props()
  const componentHeader: ComponentHeader = $derived(page.data.componentSchemas.find(i => i.uid === node.entryReference))
  const componentHeaderURL = $derived(componentHeader.type === 'dynamic' ? `/components/editor/${componentHeader.uid}` : `/components/prebuilt/${componentHeader.uid}`)
</script>

<div>
  <div class="flex gap-2 items-center py-3">
    <div class="me-3">
      <AttributeTypeIcon type="components" />
    </div>
    <h3 class="text-2xl font-bold">
      {node.name}
    </h3>
    <span class="text-sm opacity-70">
      #{node.uid.substring(0, 5)}
    </span>
  <div class="ms-auto">
    <Button preset="outlined" class="cursor-pointer" href={componentHeaderURL} target="_blank">
      Go to component
    </Button>
  </div>
  </div>
    <div>
        {#each componentHeader.attributeOrder as attributeUid (attributeUid)}
          {@const attribute = node.data[attributeUid]}
          <Attribute {attribute} {onupdate}/>
        {/each}
    </div>
</div>
