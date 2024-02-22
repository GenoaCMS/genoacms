<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/types'
  import { Input, Label } from 'flowbite-svelte'

  export let data: AttributeData<string>
</script>

<Label>
    <span class="text-xl">{data.name}</span>
    <Input type="text" bind:value={data.value} maxlength={data.schema.maxLength || undefined}
           required={!data.schema.nullable}/>
</Label>
