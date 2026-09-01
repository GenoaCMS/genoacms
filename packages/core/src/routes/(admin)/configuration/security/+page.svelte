<script lang="ts">
  import { enhance } from '$app/forms'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import { Card } from '$lib/components/ui/index'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import PolicyField from './PolicyField.svelte'
  import CeilingNotice from './CeilingNotice.svelte'
  import DegradedNotice from './DegradedNotice.svelte'
  import { describes, isCeiling } from './fields'

  /**
   * Administering the security policy.
   *
   * One form for the whole document, because that is how it is parsed and written. The guard
   * ceilings are shown apart from the rest — not because they are stored apart, but because they are
   * the only values here that change what already-published artifacts cannot be told about.
   */
  const { data, form } = $props()

  const fields = $derived(Object.keys(data.bounds))
  const ceilings = $derived(fields.filter(isCeiling))
  const rest = $derived(fields.filter(field => !isCeiling(field)))

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
  use:enhance
  class="p-4 space-y-6"
>
  <input type="hidden" name="version" value={data.version ?? ''} />

  {#if data.degraded}
    <DegradedNotice reason={data.degraded} />
  {/if}

  {#if form?.reason}
    <p class="rounded border border-red-400 bg-red-50 dark:bg-red-950 p-3 text-sm">{form.reason}</p>
  {:else if form?.success}
    <p class="rounded border border-green-400 bg-green-50 dark:bg-green-950 p-3 text-sm">Policy saved.</p>
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
