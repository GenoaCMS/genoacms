<script lang='ts'>
  import type { Attribute } from '$lib/script/components/componentHeader/component/types'
  import { dragHandle } from 'svelte-dnd-action'
  import { Button, Card, Checkbox, Dropdown, Input, Label, Textarea, } from '$lib/components/ui/index'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'
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
    onvalue: (value: Attribute) => void,
    ondelete: (uid: string) => void
  }
  let { attribute = $bindable(), onvalue, ondelete }: Props = $props()
  const value = $state(attribute)

  function deleteAttribute () {
    ondelete(value.uid)
  }
  $effect(() => {
    onvalue(value)
  })
</script>

<Card class="mb-4 p-4 max-w-full">
  <div class="w-full flex justify-between">
    <div class="flex">
      <AttributeTypeIcon type={value.type} />

    </div>
    <div>
    </div>
    <div class="flex">
      <button
        aria-label="Dragger"
        type="button"
        class="m-3"
        use:dragHandle
      >
        <i class="bi bi-arrow-down-up text-2xl m-auto"></i>
      </button>
      <Dropdown>
        <Button preset="filled" class="!bg-error-500 flex" onclick={deleteAttribute}>
          <span>Delete</span>
          <i class="bi bi-trash ms-2"></i>
        </Button>
      </Dropdown>
    </div>
  </div>
  <div class="flex items-center">
    <Label class="flex-grow">
      Name:
      <Input bind:value={value.schema.title}/>
    </Label>
    <div class="ms-4 mt-auto">
      <Checkbox bind:checked={value.schema.required}>
        Is required
      </Checkbox>
    </div>
  </div>
  <Label>
    Description:
    <Textarea bind:value={value.schema.description} />
  </Label>
  {#if value.type === 'boolean'}
    <BooleanAttribute
      bind:default={value.schema.default}
    />
  {:else if value.type === 'number'}
    <NumberAttribute schema={value.schema} />
  {:else if value.type === 'string'}
    <StringAttribute schema={value.schema} />
  {:else if value.type === 'text'}
    <TextAttribute schema={value.schema} />
  {:else if value.type === 'markdown'}
    <MarkdownAttribute schema={value.schema} />
  {:else if value.type === 'richText'}
    <RichTextAttribute schema={value.schema} />
  {:else if value.type === 'link'}
    <LinkAttribute schema={value.schema} />
  {:else if value.type === 'storageResource'}
    <StorageResourceAttribute schema={value.schema} />
  {:else if value.type === 'components'}
    <ComponentsAttribute schema={value.schema} />
  {/if}
</Card>
