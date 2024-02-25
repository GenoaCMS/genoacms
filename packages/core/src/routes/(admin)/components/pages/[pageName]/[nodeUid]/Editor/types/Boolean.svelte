<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { BooleanAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Toggle } from 'flowbite-svelte'

  export let data: AttributeData<BooleanAttributeType>
</script>

<Toggle bind:checked={data.value} required={!data.schema.nullable}>
    <span class="text-xl">{data.name}</span>
</Toggle>
