<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { BooleanAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Toggle } from 'flowbite-svelte'

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

<Toggle checked={data.value} {onchange} required={!data.schema.nullable}>
    <span class="text-xl">{data.name}</span>
</Toggle>
