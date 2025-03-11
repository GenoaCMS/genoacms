<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { StringAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Input, Card } from 'flowbite-svelte'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  interface Props {
    data: AttributeData<StringAttributeType>,
    onvalue: (v: string) => void
  }
  const { data, onvalue }: Props = $props()

  function oninput (e: InputEvent) {
    onvalue(e.target.value)
  }
</script>

<Card padding="sm" size="none" shadow={false}>
  <div class="flex">
    <div class="me-3">
      <AttributeTypeIcon type={data.type} />
    </div>
    <h3 class="text-xl pb-3">
      {data.name}
    </h3>
  </div>
  <Input type="text" bind:value={data.value} maxlength={data.schema.maxLength || undefined}
    required={!data.schema.nullable} {oninput}/>
</Card>
