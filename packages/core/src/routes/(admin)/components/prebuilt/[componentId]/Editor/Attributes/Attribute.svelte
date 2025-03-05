<script lang='ts'>
  import type { Attribute } from '$lib/script/components/componentEntry/component/types'
  import { Card, Checkbox, Input, Label } from 'flowbite-svelte'
  import BooleanAttribute from './Boolean.svelte'
  import NumberAttribute from './Number.svelte'
  import StringAttribute from './String.svelte'
  import TextAttribute from './Text.svelte'
  import MarkdownAttribute from './Markdown.svelte'
  import RichTextAttribute from './RichText.svelte'
  import LinkAttribute from './Link.svelte'
  import StorageResourceAttribute from './StorageResource.svelte'
  import ComponentsAttribute from './Components.svelte'

  interface Props {
    attribute: Attribute,
    onvalue: (value: Attribute) => void
  }
  let { attribute = $bindable(), onvalue }: Props = $props()
  const value = $state(attribute)
  $effect(() => {
    onvalue(value)
  })
</script>

<Card>
  <Label>
    Name:
    <Input bind:value={value.schema.title} />
  </Label>
  <Label>
    Description:
    <Input bind:value={value.schema.description} />
  </Label>
  <Label>
    Is required:
    <Checkbox bind:checked={value.schema.required} />
  </Label>
  {#if attribute.type === 'boolean'}
    <BooleanAttribute
      bind:default={value.schema.default}
    />
  {:else if attribute.type === 'number'}
    <NumberAttribute
      bind:default={value.schema.default}
      bind:minimum={value.schema.minimum}
      bind:maximum={value.schema.maximum}
      bind:multipleOf={value.schema.multipleOf}
    />
  {:else if attribute.type === 'string'}
    <StringAttribute />
  {:else if attribute.type === 'text'}
    <TextAttribute />
  {:else if attribute.type === 'markdown'}
    <MarkdownAttribute />
  {:else if attribute.type === 'richText'}
    <RichTextAttribute />
  {:else if attribute.type === 'link'}
    <LinkAttribute />
  {:else if attribute.type === 'storageResource'}
    <StorageResourceAttribute />
  {:else if attribute.type === 'components'}
    <ComponentsAttribute />
  {/if}
</Card>
