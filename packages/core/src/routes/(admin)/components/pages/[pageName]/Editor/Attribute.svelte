<script lang="ts">
    import type { AttributeData } from '$lib/script/components/page/types'
    import Components from './types/Components.svelte'

    export let attribute: AttributeData
</script>

<div>
    {attribute.name}
    {#if attribute.schema.type === 'array'}
        <Components bind:data={attribute} />
    {/if}
</div>
