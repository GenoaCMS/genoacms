<script lang="ts">
    import type { AttributeData } from '$lib/script/components/page/types'
    import Components from './types/Components.svelte'
    import Boolean from './types/Boolean.svelte'
    import Number from './types/Number.svelte'
    import String from './types/String.svelte'
    import Text from './types/Text.svelte'

    export let attribute: AttributeData
</script>

<div>
    {#if attribute.type === 'boolean'}
        <Boolean bind:data={attribute} />
    {:else if attribute.type === 'number'}
        <Number bind:data={attribute} />
     {:else if attribute.type === 'string'}
        <String bind:data={attribute} />
     {:else if attribute.type === 'text'}
        <Text bind:data={attribute} />
    <!-- {:else if attribute.type === 'markdown'} -->
    <!-- {:else if attribute.type === 'richText'} -->
    <!-- {:else if attribute.type === 'link'} -->
    <!-- {:else if attribute.type === 'storageResource'} -->
    {:else if attribute.type === 'component'}
        <Components bind:data={attribute} />
    {/if}
</div>
