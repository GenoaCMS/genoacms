<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { TextAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Textarea, Label } from 'flowbite-svelte'

  export let data: AttributeData<TextAttributeType>
</script>

<Label>
    <span class="text-xl">{data.name}</span>
    <Textarea type="text" bind:value={data.value} maxlength={data.schema.maxLength || undefined}
              required={!data.schema.nullable}/>
</Label>
