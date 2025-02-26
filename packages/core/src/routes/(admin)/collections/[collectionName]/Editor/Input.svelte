<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import StorageResources from './StorageResource/StorageResources.svelte'
  import StorageResource from './StorageResource/StorageResource.svelte'
  import UuidInput from './UUIDInput.svelte'
  import MarkdownInput from './MarkdownInput.svelte'
  import ArrayInput from './ArrayInput.svelte'
  import ObjectInput from './ObjectInput.svelte'
  import Const from './Const.svelte'
  import Reference from './Reference/Reference.svelte'
  import References from './Reference/References.svelte'
  import StringInput from './StringInput.svelte'
  import NumberInput from './NumberInput.svelte'
  import BooleanInput from './BooleanInput.svelte'
  import TextInput from './TextInput.svelte'

  type T = undefined | string | number | boolean | Array<T> | Record<string, unknown>
  type Props = {
    schema: JSONSchemaType<T>
    value: T,
    constraints: Record<string, unknown> | undefined,
    errors: Record<string, unknown> | Array<string> | undefined,
    onvalue: (e: T) => void
  }
  let { schema, value, constraints, errors, onvalue = (v) => { value = v } }: Props = $props()
</script>

{#if schema.title === 'reference'}
  <Reference {schema} {value} {errors} {onvalue}/>
{:else if schema.type === 'string' && schema.format === 'uuid'}
  <UuidInput {value} {errors} {onvalue}/>
{:else if schema.type === 'string' && schema.format === 'text'}
  <TextInput {schema} {value} {constraints} {errors} {onvalue}/>
{:else if schema.type === 'string' && schema.format === 'markdown'}
  <MarkdownInput {value} {errors} {onvalue}/>
{:else if schema.type === 'string'}
  <StringInput {schema} {value} {constraints} {errors} {onvalue}/>
{:else if schema.type === 'number'}
  <NumberInput {schema} {value} {constraints} {errors} {onvalue}/>
{:else if schema.type === 'boolean'}
  <BooleanInput {schema} {value} {constraints} {errors} {onvalue}/>
{:else if schema.type === 'array' &&
  schema.items.title === 'reference'}
  <References schema={schema.items} {value} {errors} {onvalue}/>
{:else if schema.type === 'array' && schema.items.title === 'storageResource'}
  <StorageResources {value} {errors} {onvalue}/>
{:else if schema.title === 'storageResource'}
  <StorageResource {value} {errors} {onvalue}/>
{:else if schema.type === 'array'}
  <ArrayInput {schema} {value} {constraints} {errors} {onvalue}/>
{:else if schema.type === 'object'}
  <ObjectInput {schema} {value} {constraints} {errors} {onvalue}/>
{:else if schema.const}
  <Const constValue={schema.const} {onvalue}/>
{/if}
