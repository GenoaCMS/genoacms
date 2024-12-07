<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { Checkbox, Input, Textarea } from 'flowbite-svelte'
  import StorageResources from './StorageResource/StorageResources.svelte'
  import UuidInput from './UUIDInput.svelte'
  import MarkdownInput from './MarkdownInput.svelte'
  import ArrayInput from './ArrayInput.svelte'
  import ObjectInput from './ObjectInput.svelte'
  import Const from './Const.svelte'

  type Arr = string | number | boolean | object
  type T = string | number | boolean | Array<Arr>
  export let name: string
  export let schema: JSONSchemaType<T>
  export let value: undefined & T
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
  schema.items === 'string' &&
  schema.items.format === 'storageResource'}
    <StorageResources {name} resources={value}/>
{:else if schema.type === 'array'}
  <ArrayInput {name} {schema} bind:value/>
{:else if schema.type === 'object'}
  <ObjectInput {name} {schema} bind:value/>
{:else if schema.const}
  <Const {name} constValue={schema.const} bind:value/>
{/if}
