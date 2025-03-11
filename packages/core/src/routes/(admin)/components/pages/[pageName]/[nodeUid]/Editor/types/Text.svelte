<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { TextAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Textarea, Card } from 'flowbite-svelte'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  interface Props {
    data: AttributeData<TextAttributeType>,
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
    <Textarea type="text" bind:value={data.value} maxlength={data.schema.maxLength || undefined}
              required={!data.schema.nullable} {oninput}/>
</Card>
