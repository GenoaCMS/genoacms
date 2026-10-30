<script lang="ts">
  import type { SchemaObject } from '$lib/script/schema'
  import type { InputValue } from '$lib/components/editors/types'
  import Input from './Input.svelte'
  import { fieldHint, fieldKindOf, isCompact, isHidden, isLabellable } from './fieldKind'

  interface Props {
    name: string
    schema: SchemaObject
    value: InputValue
    onvalue: (value: InputValue) => void
  }
  const { name, schema, value, onvalue }: Props = $props()
  const id = $props.id()

  const kind = $derived(fieldKindOf(schema))
  const hint = $derived(fieldHint(kind, schema, value))
  const span = $derived(isCompact(kind) ? '' : '@xl:col-span-2')
</script>

{#snippet hintBadge ()}
  {#if hint}
    <span class="ms-auto text-[0.7rem] font-normal tracking-wide text-surface-600-400 truncate">{hint}</span>
  {/if}
{/snippet}

{#if isHidden(kind)}
  <Input {schema} {value} {onvalue} />
{:else if kind === 'boolean'}
  <div class="{span} flex items-end">
    <label for={id} class="flex w-full items-center gap-3 rounded-container border border-surface-200-800 px-3 py-2 cursor-pointer hover:bg-surface-100-900 transition-colors">
      <Input {id} {schema} {value} {onvalue} />
      <span class="text-sm font-medium">{name}</span>
    </label>
  </div>
{:else if isLabellable(kind)}
  <div class="{span} flex flex-col gap-1.5 min-w-0">
    <div class="flex items-baseline gap-2">
      <label for={id} class="text-sm font-medium">{name}</label>
      {@render hintBadge()}
    </div>
    <Input {id} {schema} {value} {onvalue} />
  </div>
{:else}
  <fieldset class="{span} min-w-0 space-y-1.5">
    <legend class="w-full flex items-baseline gap-2 text-sm font-medium">
      {name}
      {@render hintBadge()}
    </legend>
    {#if kind === 'object'}
      <div class="rounded-container border border-surface-200-800 bg-surface-100-900/40 p-4">
        <Input {schema} {value} {onvalue} />
      </div>
    {:else}
      <Input {schema} {value} {onvalue} />
    {/if}
  </fieldset>
{/if}
