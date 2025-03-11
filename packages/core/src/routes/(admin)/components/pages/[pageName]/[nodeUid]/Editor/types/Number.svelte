<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { NumberAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Input, Label } from 'flowbite-svelte'

  interface Props {
    data: AttributeData<NumberAttributeType>
    onvalue: (v: number) => void
  }
  const { data, onvalue }: Props = $props()

  function oninput (e: InputEvent) {
    onvalue(e.target.value)
  }
</script>

<Label>
    <span class="text-xl">{data.name}</span>
    <Input type="number" bind:value={data.value} min={data.schema.minimum || undefined}
           max={data.schema.maximum || undefined} step={data.schema.multipleOf || undefined}
           required={!data.schema.nullable} {oninput}/>
</Label>
