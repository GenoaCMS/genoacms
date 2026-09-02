<script lang="ts">
  import { enhance } from '$app/forms'
  import { enhanceWithToast } from '../formToast'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import { Card } from '$lib/components/ui/index'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import PolicyField from './PolicyField.svelte'
  import CeilingNotice from './CeilingNotice.svelte'
  import DegradedNotice from './DegradedNotice.svelte'
  import OriginList from './OriginList.svelte'
  import { describes, isCeiling } from './fields'

  /**
   * Administering the security policy.
   *
   * One form for the whole document, because that is how it is parsed and written. The guard
   * ceilings are shown apart from the rest — not because they are stored apart, but because they are
   * the only values here that change what already-published artifacts cannot be told about.
   */
  const { data } = $props()

  const fields = $derived(Object.keys(data.bounds))
  const ceilings = $derived(fields.filter(isCeiling))
  const rest = $derived(fields.filter(field => !isCeiling(field)))

  /**
   * `reset: false`, because this form edits what is already stored.
   *
   * Without it a successful save clears every field until the page is reloaded — SvelteKit resets
   * the form, and a reset restores attribute defaults that a Svelte-bound input never has.
   */
  const save = enhanceWithToast('Policy saved', 'Could not save the policy', undefined, { reset: false })

  const policy = $derived(data.policy as unknown as Record<string, number>)
  const bounds = $derived(data.bounds as unknown as Record<string, { min: number, max: number }>)
</script>

<TopPanel>
  <h1 class="text-2xl">Security policy</h1>
  {#snippet right()}
    <PermissionGate permission="config:security:manage">
      <button
        type="submit"
        form="security-policy-form"
        class="h-full flex items-center cursor-pointer px-3"
        aria-label="Save"
        title="Save policy"
      >
        <i class="bi bi-floppy text-2xl hover:text-warning transition-all"></i>
      </button>
    </PermissionGate>
  {/snippet}
</TopPanel>

<form
  id="security-policy-form"
  method="POST"
  action="?/save"
  use:enhance={save}
  class="p-4 space-y-6"
>
  <input type="hidden" name="version" value={data.version ?? ''} />

  {#if data.degraded}
    <DegradedNotice reason={data.degraded} />
  {/if}

  <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
    <Card class="space-y-4">
      <h2 class="text-xl">Runtime guard ceilings</h2>
      <CeilingNotice />
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {#each ceilings as field (field)}
          <PolicyField
            name={field}
            label={describes(field).label}
            describe={describes(field).describe}
            value={policy[field]}
            min={bounds[field].min}
            max={bounds[field].max}
          />
        {/each}
      </div>
    </Card>

    <Card class="space-y-4">
      <h2 class="text-xl">Where a component may fetch</h2>
      <p class="text-sm opacity-70">
        A component reaches the network only through its bridge, and the bridge reaches only these.
        The list is compiled into each component when it is published, so a change here binds what
        is published afterwards.
      </p>
      <OriginList origins={data.policy.fetchOrigins} maximum={data.maxOrigins} />
    </Card>

    <Card class="space-y-4">
      <h2 class="text-xl">Keys and sessions</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each rest as field (field)}
          <PolicyField
            name={field}
            label={describes(field).label}
            describe={describes(field).describe}
            value={policy[field]}
            min={bounds[field].min}
            max={bounds[field].max}
          />
        {/each}
      </div>
    </Card>
  </div>
</form>
