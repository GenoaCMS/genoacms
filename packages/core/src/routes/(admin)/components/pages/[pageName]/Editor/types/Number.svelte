<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/types'
  import { Input, Label } from 'flowbite-svelte'

  export let data: AttributeData<number>
</script>

<Label>
    <span class="text-xl">{data.name}</span>
    <Input type="number" bind:value={data.value} min={data.schema?.minimum} max={data.schema?.maximum}
           step={data.schema?.multipleOf} required={!data.schema.nullable}/>
</Label>
