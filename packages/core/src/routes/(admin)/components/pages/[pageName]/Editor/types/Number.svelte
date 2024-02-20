<script lang="ts">
  import Input from '$lib/components/Input.svelte'
  import type { AttributeData } from '$lib/script/components/page/types'
  import { Label } from 'flowbite-svelte'

  export let data: AttributeData<number>
</script>

<Label>
    {data.name}
    <Input type="number" bind:value={data.value} min={data.schema?.minimum} max={data.schema?.maximum}
           step={data.schema?.multipleOf}/>
</Label>
