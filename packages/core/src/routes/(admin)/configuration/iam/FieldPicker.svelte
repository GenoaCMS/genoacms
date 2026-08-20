<script lang="ts">
  import { Switch } from '@skeletonlabs/skeleton-svelte'
  import { SwitchList } from '$lib/components/ui/index'
  import { WILDCARD, type FieldSelector } from '$lib/script/authorization/grants'

  /**
   * Which fields of one collection a `read` or `write` grant covers.
   *
   * **Every field** and a named list are genuinely different grants, not a shortcut for each other:
   * the wildcard covers fields added to the collection later, a list does not. Toggling every switch
   * on therefore does not silently become the wildcard — a role restricted to the fields that exist
   * today must stay restricted when tomorrow's field appears.
   */
  interface Props {
    collection: string
    /** The collection's fields, from the catalogue. */
    available: string[]
    selection: FieldSelector
    onchange: (selection: FieldSelector) => void
  }
  const { collection, available, selection, onchange }: Props = $props()

  const everyField = $derived(selection === WILDCARD)
  const named = $derived(selection === WILDCARD ? [] : selection)

  function toggleEveryField (on: boolean): void {
    // Leaving the wildcard starts from nothing rather than from every field, so the narrower grant
    // is composed deliberately instead of by switching fields off one at a time.
    onchange(on ? WILDCARD : [])
  }

  function toggleField (field: string, on: boolean): void {
    onchange(on ? [...named, field] : named.filter(existing => existing !== field))
  }
</script>

<div class="space-y-2 border-l-2 border-surface-200-800 pl-3">
  <div class="flex items-center justify-between">
    <span class="text-xs font-medium opacity-70">Fields of <code>{collection}</code></span>
    <Switch
      checked={everyField}
      onCheckedChange={(e) => toggleEveryField(e.checked)}
      class="flex items-center gap-2"
    >
      <Switch.Label class="text-xs font-medium">Every field</Switch.Label>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.HiddenInput />
    </Switch>
  </div>

  {#if !everyField}
    <SwitchList
      options={available}
      selected={named}
      ontoggle={toggleField}
      emptyMessage="This collection declares no fields. Grant every field instead."
      dense
    />
    {#if named.length > 0}
      <p class="text-xs opacity-60">
        A field added to this collection later is not covered by this grant.
      </p>
    {/if}
  {/if}
</div>
