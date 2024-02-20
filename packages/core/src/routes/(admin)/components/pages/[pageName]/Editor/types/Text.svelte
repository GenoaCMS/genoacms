<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/types'
  import { Textarea, Label } from 'flowbite-svelte'

  export let data: AttributeData<string>
</script>

<Label>
    <span class="text-xl">{data.name}</span>
    <Textarea type="text" bind:value={data.value} maxlength={data.schema?.maxLength} required={!data.schema.nullable}/>
</Label>
