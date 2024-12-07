<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Checkbox, Input, Textarea } from 'flowbite-svelte'
  import StorageResources from './StorageResource/StorageResources.svelte'
  import StorageResource from './StorageResource/StorageResource.svelte'
  import UuidInput from './UUIDInput.svelte'
  import MarkdownInput from './MarkdownInput.svelte'
  import ArrayInput from './ArrayInput.svelte'
  import ObjectInput from './ObjectInput.svelte'
  import Const from './Const.svelte'

  type Arr = string | number | boolean | object
  type T = string | number | boolean | Array<Arr>
  type Props = {
    name: string
    schema: JSONSchemaType<T>
    value: T
  }
  let { name, schema, value = $bindable() }: Props = $props()
</script>

{#if schema.type === 'string' && schema.format === 'uuid'}
  <UuidInput {name} bind:value/>
{:else if schema.type === 'string' && schema.format === 'text'}
  <Textarea {name} bind:value/>
{:else if schema.type === 'string' && schema.format === 'markdown'}
  <MarkdownInput {name} bind:value/>
{:else if schema.type === 'string' && schema.format === 'reference'}
    <Input {name} type="text" bind:value/>
{:else if schema.type === 'string'}
    <Input {name} bind:value/>
{:else if schema.type === 'number'}
    <Input {name} type="number" bind:value/>
{:else if schema.type === 'boolean'}
    <Checkbox {name} bind:checked={value}/>
{:else if schema.type === 'array' &&
  schema.items.type === 'object' &&
  schema.items.title === 'storageResource'}
    <StorageResources {name} bind:resources={value}/>
{:else if schema.type === 'object' &&
  schema.title === 'storageResource'}
    <StorageResource {name} bind:resource={value}/>
{:else if schema.type === 'array'}
  <ArrayInput {name} {schema} bind:value/>
{:else if schema.type === 'object'}
  <ObjectInput {name} {schema} bind:value/>
{:else if schema.const}
  <Const {name} constValue={schema.const} bind:value/>
{/if}
