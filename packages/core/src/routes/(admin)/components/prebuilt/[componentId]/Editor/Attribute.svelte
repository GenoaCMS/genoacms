<script lang='ts'>
  import type { Attribute } from '$lib/script/components/componentEntry/component/types'
  import { Button, Card, Checkbox, Dropdown, Input, Label, Textarea } from 'flowbite-svelte'
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

<Card class="mb-4 p-4 max-w-full">
  <div class="w-full flex justify-between">
    <div class="flex">
      <AttributeTypeIcon type={value.type} />
      <!--button aria-label="Dragger" type="button" use:dragHandle> TODO: think about order
        <i class="bi bi-arrow-down-up text-2xl m-auto"></i>
      </button-->
    </div>
    <div>
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
  <div class="flex items-center">
    <Label class="flex-grow">
      Name:
      <Input bind:value={value.schema.title} />
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
    <LinkAttribute
      bind:default={value.schema.default}
      bind:minItems={value.schema.minItems}
      bind:maxItems={value.schema.maxItems}
    />
  {:else if attribute.type === 'storageResource'}
    <StorageResourceAttribute />
  {:else if attribute.type === 'components'}
    <ComponentsAttribute
      bind:default={value.schema.default}
      bind:minItems={value.schema.minItems}
      bind:maxItems={value.schema.maxItems}
    />
  {/if}
</Card>
