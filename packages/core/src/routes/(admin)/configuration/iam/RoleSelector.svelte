<script lang="ts">
  import { Switch } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    /** Every role that exists, declared and stored alike — a declared role is assignable. */
    available: string[]
    /** Roles the account already holds, so an unchanged submission is a no-op. */
    selected?: string[]
  }
  const { available, selected = [] }: Props = $props()

  /**
   * A switch per role rather than free text.
   *
   * The assignment must name roles that exist — the service refuses anything else — so offering free
   * text meant a typo became a refusal. Here the invalid input is simply unrepresentable, and an
   * administrator does not have to remember role names to use the form.
   *
   * Each switch submits its own field via `HiddenInput`, which is why the action reads repeated
   * `roles` values rather than splitting one delimited string.
   */
  let held = $state([...selected])

  function toggle (name: string, on: boolean): void {
    held = on ? [...held, name] : held.filter(existing => existing !== name)
  }
</script>

{#if available.length === 0}
  <p class="text-xs opacity-60">No roles exist yet. Create one first, then assign it.</p>
{:else}
  <div class="card preset-filled-surface-100-900 max-h-56 divide-y divide-surface-200-800 overflow-y-auto">
    {#each available as name (name)}
      <Switch
        name="roles"
        value={name}
        checked={held.includes(name)}
        onCheckedChange={(e) => toggle(name, e.checked)}
        class="flex w-full items-center justify-between gap-4 p-3"
      >
        <Switch.Label>{name}</Switch.Label>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.HiddenInput />
      </Switch>
    {/each}
  </div>
{/if}
