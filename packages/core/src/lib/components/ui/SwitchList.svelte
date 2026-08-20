<script lang="ts">
  import { Switch } from '@skeletonlabs/skeleton-svelte'

  /**
   * A switch per option, for choosing any number of them.
   *
   * The presentation layer only: it knows how to render a list of names as toggles and nothing about
   * what the names mean. Choosing buckets, collections and fields are the same control over
   * different lists.
   *
   * State stays with the caller — this reports a toggle rather than owning the selection — so the
   * one place a selection lives is the row it belongs to, and the list cannot drift out of step
   * with what will be saved.
   */
  interface Props {
    options: string[]
    selected: string[]
    ontoggle: (option: string, on: boolean) => void
    /** Shown instead of the list when there is nothing to choose. */
    emptyMessage?: string
    disabled?: boolean
    /** Caps the visible height before scrolling. Fields lists can be long. */
    dense?: boolean
  }

  const {
    options,
    selected,
    ontoggle,
    emptyMessage = 'Nothing to choose from',
    disabled = false,
    dense = false
  }: Props = $props()
</script>

{#if options.length === 0}
  <p class="text-xs opacity-60">{emptyMessage}</p>
{:else}
  <div
    class="card preset-filled-surface-50-950 border border-surface-200-800 divide-y divide-surface-200-800 overflow-y-auto {dense ? 'max-h-40' : 'max-h-56'} {disabled ? 'pointer-events-none opacity-50' : ''}"
  >
    {#each options as option (option)}
      <Switch
        checked={selected.includes(option)}
        {disabled}
        onCheckedChange={(e) => ontoggle(option, e.checked)}
        class="flex w-full items-center justify-between gap-4 {dense ? 'px-3 py-2' : 'p-3'}"
      >
        <Switch.Label class={dense ? 'text-sm' : ''}>{option}</Switch.Label>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <!-- The hidden input *is* the interactive control: Zag renders the real checkbox here and
             the visible parts are decoration. Omitting it renders a switch nothing can click. -->
        <Switch.HiddenInput />
      </Switch>
    {/each}
  </div>
{/if}
