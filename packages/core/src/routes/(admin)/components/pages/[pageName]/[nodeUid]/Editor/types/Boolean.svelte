<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { BooleanAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Card, Toggle } from '$lib/components/ui/index'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  interface Props {
    data: AttributeData<BooleanAttributeType>,
    onvalue: (v: boolean) => void
  }
  const { data, onvalue }: Props = $props()

  function onchange (e: CustomEvent<boolean>) {
    data.value = e.target.checked
    onvalue(data.value)
  }
</script>

<Card size="xl" class="p-4">
  <div class="flex">
  <div class="me-auto flex">
    <div class="me-3">
      <AttributeTypeIcon type={data.type} />
    </div>
    <span class="text-xl">{data.name}</span>
  </div>
  <Toggle checked={data.value} {onchange} required={!data.schema.nullable}/>
  </div>
</Card>
