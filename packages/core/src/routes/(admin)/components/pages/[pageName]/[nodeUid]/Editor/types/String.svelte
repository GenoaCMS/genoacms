<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { StringAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Input, Label } from 'flowbite-svelte'

  export let data: AttributeData<StringAttributeType>
</script>

<Label>
    <span class="text-xl">{data.name}</span>
    <Input type="text" bind:value={data.value} maxlength={data.schema.maxLength || undefined}
           required={!data.schema.nullable}/>
</Label>
