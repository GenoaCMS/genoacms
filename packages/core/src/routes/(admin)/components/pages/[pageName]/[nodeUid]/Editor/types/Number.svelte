<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import { Input, Label } from 'flowbite-svelte'

  export let data: AttributeData<number>
</script>

<Label>
    <span class="text-xl">{data.name}</span>
    <Input type="number" bind:value={data.value} min={data.schema.minimum || undefined}
           max={data.schema.maximum || undefined} step={data.schema.multipleOf || undefined}
           required={!data.schema.nullable}/>
</Label>
