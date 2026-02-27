<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import type { InputValue } from './types'
  import StorageResources from '$lib/components/editors/StorageResource/StorageResources.svelte'
  import StorageResource from '$lib/components/editors/StorageResource/StorageResource.svelte'
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

  interface Props {
    schema: JSONSchemaType<InputValue>;
    value: InputValue;
    onvalue: (e: InputValue) => void;
    ondelete?: () => void;
  }
  let {
    schema,
    value,
    onvalue = (v) => {
      value = v
    },
    ondelete = () => {},
  }: Props = $props()
</script>

{#if schema.title === 'reference'}
  <Reference {schema} {value} {onvalue} />
{:else if schema.type === 'string' && schema.format === 'uuid'}
  <UuidInput {value} {onvalue} />
{:else if schema.type === 'string' && schema.format === 'text'}
  <TextInput {schema} {value} {onvalue} />
{:else if schema.type === 'string' && schema.format === 'markdown'}
  <MarkdownInput {value} {onvalue} />
{:else if schema.type === 'string'}
  <StringInput {schema} {value} {onvalue} />
{:else if schema.type === 'number'}
  <NumberInput {schema} {value} {onvalue} />
{:else if schema.type === 'boolean'}
  <BooleanInput {schema} {value} {onvalue} />
{:else if schema.type === 'array' && schema.items.title === 'reference'}
  <References schema={schema.items} {value} {onvalue} />
{:else if schema.type === 'array' && schema.items.title === 'storageResource'}
  <StorageResources {schema} {value} {onvalue} />
{:else if schema.title === 'storageResource'}
  <StorageResource {value} {onvalue} />
{:else if schema.type === 'array'}
  <ArrayInput {schema} {value} {onvalue} />
{:else if schema.type === 'object'}
  <ObjectInput {schema} {value} {onvalue} {ondelete} />
{:else if schema.const}
  <Const constValue={schema.const} {onvalue} />
{/if}
