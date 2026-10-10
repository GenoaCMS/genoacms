<script lang="ts">
  import { asSchemaObject, type SchemaObject } from '$lib/script/schema'
  import type { InputValue } from '$lib/components/editors/types'
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
  import EnumInput from './EnumInput.svelte'
  import { fieldKindOf } from './fieldKind'

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
  <Reference {schema} {value} {onvalue} />
{:else if kind === 'uuid'}
  <UuidInput {id} {value} {onvalue} />
{:else if kind === 'text'}
  <TextInput {id} {schema} {value} {onvalue} />
{:else if kind === 'markdown'}
  <MarkdownInput {value} {onvalue} />
{:else if kind === 'enum'}
  <EnumInput {schema} {value} {onvalue} />
{:else if kind === 'string'}
  <StringInput {id} {schema} {value} {onvalue} />
{:else if kind === 'number'}
  <NumberInput {id} {schema} {value} {onvalue} />
{:else if kind === 'boolean'}
  <BooleanInput {id} {schema} {value} {onvalue} />
{:else if kind === 'references' && items}
  <References schema={items} {value} {onvalue} />
{:else if kind === 'files'}
  <StorageResources {schema} {value} {onvalue} />
{:else if kind === 'file'}
  <StorageResource {value} {onvalue} />
{:else if kind === 'list'}
  <ArrayInput {schema} {value} {onvalue} />
{:else if kind === 'object'}
  <ObjectInput {schema} {value} {onvalue} />
{:else if kind === 'const'}
  <Const constValue={schema.const as InputValue} {onvalue} />
{/if}
