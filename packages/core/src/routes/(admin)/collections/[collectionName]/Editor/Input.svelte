<script lang="ts">
  import { asSchemaObject, type SchemaObject } from '#lib/script/schema.js'
  import type { InputValue, StringValue, NumberValue, BooleanValue, ArrayValue, ResourcesValue, ResourceValue, ObjectValue } from '#lib/components/editors/types.js'
  import StorageResources from '#lib/components/editors/StorageResource/StorageResources.svelte'
  import StorageResource from '#lib/components/editors/StorageResource/StorageResource.svelte'
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
  import EnumInput from './EnumInput.svelte'
  import { fieldKindOf } from './fieldKind'

  type ReferenceValue = string | number | boolean | null

  interface Props {
    schema: SchemaObject
    value: InputValue
    onvalue: (e: InputValue) => void
    id?: string
  }
  let {
    schema,
    value,
    onvalue = (v) => {
      value = v
    },
    id,
  }: Props = $props()

  const kind = $derived(fieldKindOf(schema))
  // `items` may be absent or a tuple in JSON Schema; the editor only handles
  // the single-schema form
  const items = $derived(asSchemaObject(schema.items))
</script>

{#if kind === 'reference'}
  <Reference {schema} value={value as ReferenceValue} {onvalue} />
{:else if kind === 'uuid'}
  <UuidInput {id} value={value as StringValue} {onvalue} />
{:else if kind === 'text'}
  <TextInput {id} value={value as StringValue} {onvalue} />
{:else if kind === 'markdown'}
  <MarkdownInput value={value as StringValue} {onvalue} />
{:else if kind === 'enum'}
  <EnumInput {schema} {value} {onvalue} />
{:else if kind === 'string'}
  <StringInput {id} value={value as StringValue} {onvalue} />
{:else if kind === 'number'}
  <NumberInput {id} value={value as NumberValue} {onvalue} />
{:else if kind === 'boolean'}
  <BooleanInput {id} value={value as BooleanValue} {onvalue} />
{:else if kind === 'references' && items}
  <References schema={items} value={value as Array<string | number | boolean> | undefined} {onvalue} />
{:else if kind === 'files'}
  <StorageResources {schema} value={value as ResourcesValue} {onvalue} />
{:else if kind === 'file'}
  <StorageResource value={value as ResourceValue} {onvalue} />
{:else if kind === 'list'}
  <ArrayInput {schema} value={value as ArrayValue} {onvalue} />
{:else if kind === 'object'}
  <ObjectInput {schema} value={value as ObjectValue} {onvalue} />
{:else if kind === 'const'}
  <Const constValue={schema.const as InputValue} {onvalue} />
{/if}
