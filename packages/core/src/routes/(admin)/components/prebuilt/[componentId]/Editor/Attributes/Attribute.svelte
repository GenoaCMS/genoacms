<script lang='ts'>
  import type { Attribute } from '$lib/script/components/componentEntry/component/types'
  import { Button, Card, Checkbox, Dropdown, Input, Label } from 'flowbite-svelte'
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
  let isDropdownOpen = $state(false)
  function toggleDropdown () {
    isDropdownOpen = !isDropdownOpen
  }
  function deleteAttribute () {
    ondelete(value.uid)
  }
  $effect(() => {
    onvalue(value)
  })
</script>

<Card size="none" class="mb-4">
  <div class="w-full flex justify-between">
    <div class="flex">
      <!--button aria-label="Dragger" type="button" use:dragHandle> TODO: think about order
        <i class="bi bi-arrow-down-up text-2xl m-auto"></i>
      </button-->
    </div>
    <div>
      {value.type}
    </div>
    <div class="flex">
      <Button color="none" onclick={toggleDropdown}>
        <i class="bi bi-three-dots-vertical text-2xl m-auto"></i>
      </Button>
      <Dropdown open={isDropdownOpen}>
        <Button color="red" class="flex" onclick={deleteAttribute}>
          <span>Delete</span>
          <i class="bi bi-trash ms-2"></i>
        </Button>
      </Dropdown>
    </div>
  </div>
  <Label>
    Name:
    <Input bind:value={value.schema.title} />
  </Label>
  <Label>
    Description:
    <Input bind:value={value.schema.description} />
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
    <StringAttribute
      bind:default={value.schema.default}
      bind:minLength={value.schema.minLength}
      bind:maxLength={value.schema.maxLength}
      bind:pattern={value.schema.pattern}
      bind:format={value.schema.format}
    />
  {:else if attribute.type === 'text'}
    <TextAttribute
      bind:default={value.schema.default}
      bind:minLength={value.schema.minLength}
      bind:maxLength={value.schema.maxLength}
      bind:pattern={value.schema.pattern}
      bind:format={value.schema.format}
    />
  {:else if attribute.type === 'markdown'}
    <MarkdownAttribute
      bind:default={value.schema.default}
      bind:minLength={value.schema.minLength}
      bind:maxLength={value.schema.maxLength}
      bind:pattern={value.schema.pattern}
      bind:format={value.schema.format}
    />
  {:else if attribute.type === 'richText'}
    <RichTextAttribute />
  {:else if attribute.type === 'link'}
    <LinkAttribute />
  {:else if attribute.type === 'storageResource'}
    <StorageResourceAttribute />
  {:else if attribute.type === 'components'}
    <ComponentsAttribute
      bind:default={value.schema.default}
      bind:minItems={value.schema.minItems}
      bind:maxItems={value.schema.maxItems}
    />
  {/if}
  <Label>
    Is required:
    <Checkbox bind:checked={value.schema.required} />
  </Label>
</Card>
