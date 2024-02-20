<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/types'
  import { Toggle } from 'flowbite-svelte'

  export let data: AttributeData<boolean>
</script>

<Toggle bind:checked={data.value} required={!data.schema.nullable}>
    <span class="text-xl">{data.name}</span>
</Toggle>
