<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { AttributeType } from '$lib/script/components/componentHeader/component/types'
  import type { AttributeValue } from '$lib/script/components/componentHeader/attribute/types'
  import Components from './types/Components.svelte'
  import Boolean from './types/Boolean.svelte'
  import Number from './types/Number.svelte'
  import String from './types/String.svelte'
  import Text from './types/Text.svelte'
  import Markdown from './types/Markdown.svelte'
  import Links from './types/Links.svelte'
  import StorageResource from './types/StorageResource.svelte'

  interface Props {
    attribute: AttributeData,
    onupdate: (uid: string, val: AttributeValue) => void
  }
  const { attribute, onupdate }: Props = $props()

  function update (value: AttributeValue) {
    onupdate(attribute.uid, value)
  }
  function isOfType<T extends AttributeType> (attribute: AttributeData, type: T): attribute is AttributeData<T> {
    return attribute.type === type
  }
</script>

<div class="pt-3">
  {#if isOfType(attribute, 'boolean')}
    <Boolean
      data={attribute}
      onvalue={update}
    />
  {:else if isOfType(attribute, 'number')}
    <Number
      data={attribute}
      onvalue={update}
    />
  {:else if isOfType(attribute, 'string')}
    <String
      data={attribute}
      onvalue={update}
    />
  {:else if isOfType(attribute, 'text')}
    <Text
      data={attribute}
      onvalue={update}
    />
  {:else if isOfType(attribute, 'markdown')}
    <Markdown
      data={attribute}
      onvalue={update}
    />
    <!-- {:else if attribute.type === 'richText'} -->
  {:else if isOfType(attribute, 'link')}
    <Links
      data={attribute}
      onvalue={update}
    />
  {:else if isOfType(attribute, 'storageResource')}
    <StorageResource
      data={attribute}
      onvalue={update}
    />
  {:else if isOfType(attribute, 'components')}
    <Components
      data={attribute}
      onvalue={update}
    />
  {/if}
</div>
