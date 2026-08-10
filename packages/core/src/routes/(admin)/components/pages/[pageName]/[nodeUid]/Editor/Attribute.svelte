<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import Components from './types/Components.svelte'
  import Boolean from './types/Boolean.svelte'
  import Number from './types/Number.svelte'
  import String from './types/String.svelte'
  import Text from './types/Text.svelte'
  import Markdown from './types/Markdown.svelte'
  import Links from './types/Links.svelte'
  import StorageResource from './types/StorageResource.svelte'

  interface Props {
    attribute: AttributeData<never>,
    onupdate: (uid: string, val: AttributeData<never>['value']) => void
  }
  const { attribute, onupdate }: Props = $props()

  function update (value) {
    onupdate(attribute.uid, value)
  }
</script>

<div class="pt-3">
  {#if attribute.type === 'boolean'}
    <Boolean
      data={attribute}
      onvalue={update}
    />
  {:else if attribute.type === 'number'}
    <Number
      data={attribute}
      onvalue={update}
    />
  {:else if attribute.type === 'string'}
    <String
      data={attribute}
      onvalue={update}
    />
  {:else if attribute.type === 'text'}
    <Text
      data={attribute}
      onvalue={update}
    />
  {:else if attribute.type === 'markdown'}
    <Markdown
      data={attribute}
      onvalue={update}
    />
    <!-- {:else if attribute.type === 'richText'} -->
  {:else if attribute.type === 'link'}
    <Links
      data={attribute}
      onvalue={update}
    />
  {:else if attribute.type === 'storageResource'}
    <StorageResource
      data={attribute}
      onvalue={update}
    />
  {:else if attribute.type === 'components'}
    <Components
      data={attribute}
      onvalue={update}
    />
  {/if}
</div>
