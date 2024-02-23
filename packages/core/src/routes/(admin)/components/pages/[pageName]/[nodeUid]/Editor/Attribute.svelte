<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import Components from './types/Components.svelte'
  import Boolean from './types/Boolean.svelte'
  import Number from './types/Number.svelte'
  import String from './types/String.svelte'
  import Text from './types/Text.svelte'
  import Markdown from './types/Markdown.svelte'
  import Link from './types/Link.svelte'
  import StorageResource from './types/StorageResource.svelte'

  export let attribute: AttributeData
</script>

<div class="pt-3">
    {#if attribute.type === 'boolean'}
        <Boolean bind:data={attribute} />
    {:else if attribute.type === 'number'}
        <Number bind:data={attribute} />
     {:else if attribute.type === 'string'}
        <String bind:data={attribute} />
     {:else if attribute.type === 'text'}
        <Text bind:data={attribute} />
     {:else if attribute.type === 'markdown'}
        <Markdown bind:data={attribute} />
    <!-- {:else if attribute.type === 'richText'} -->
     {:else if attribute.type === 'link'}
        <Link bind:data={attribute} />
     {:else if attribute.type === 'storageResource'}
        <StorageResource bind:data={attribute} />
    {:else if attribute.type === 'components'}
        <Components bind:data={attribute} />
    {/if}
</div>
