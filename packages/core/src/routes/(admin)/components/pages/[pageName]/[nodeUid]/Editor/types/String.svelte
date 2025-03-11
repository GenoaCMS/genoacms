<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { StringAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Input, Label } from 'flowbite-svelte'

  interface Props {
    data: AttributeData<StringAttributeType>,
    onvalue: (v: string) => void
  }
  const { data, onvalue }: Props = $props()

  function oninput (e: InputEvent) {
    onvalue(e.target.value)
  }
</script>

<Label>
    <span class="text-xl">{data.name}</span>
    <Input type="text" bind:value={data.value} maxlength={data.schema.maxLength || undefined}
           required={!data.schema.nullable} {oninput}/>
</Label>
