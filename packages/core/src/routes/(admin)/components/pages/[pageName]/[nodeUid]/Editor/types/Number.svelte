<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { NumberAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Input, Card } from '$lib/components/ui/index'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  interface Props {
    data: AttributeData<NumberAttributeType>
    onvalue: (v: number) => void
  }
  const { data, onvalue }: Props = $props()

  function oninput (e: InputEvent) {
    onvalue(e.target.value)
  }
</script>

<Card size="xl" class="p-4">
  <div class="flex">
    <div class="me-3">
      <AttributeTypeIcon type={data.type} />
    </div>
    <h3 class="text-xl pb-3">
      {data.name}
    </h3>
  </div>
    <Input type="number" bind:value={data.value} min={data.schema.minimum || undefined}
           max={data.schema.maximum || undefined} step={data.schema.multipleOf || undefined}
           required={!data.schema.nullable} {oninput}/>
</Card>
