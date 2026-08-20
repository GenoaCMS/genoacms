<script lang="ts">
  import { Card } from '$lib/components/ui/index'
  import { formatMoment, rotationStanding, rotationExplanation } from './keyPresentation'
  import type { KeyAdministrationView } from '$lib/script/signing/keyAdministration'

  /**
   * The state of the registry itself, as opposed to the keys in it.
   *
   * The sequence is on screen because it is what rollback detection rests on: an administrator
   * comparing two instances, or checking a restored bucket, has no other way to see how far
   * publication had advanced.
   */
  interface Props {
    sequence: number
    rotation: KeyAdministrationView['rotation']
  }
  const { sequence, rotation }: Props = $props()

  const standing = $derived(rotation === undefined ? undefined : rotationStanding(rotation.dueAt, Date.now()))
</script>

<Card>
  <h2 class="text-lg mb-3">Registry</h2>

  <dl class="text-sm space-y-2">
    <div class="flex justify-between gap-2">
      <dt class="opacity-70" title="Incremented on every publication. Restoring an older registry is detected by it.">
        sequence
      </dt>
      <dd class="font-mono">{sequence}</dd>
    </div>

    {#if rotation === undefined || standing === undefined}
      <!-- The interval lives in the signed policy document. Guessing one here would be read as a
           promise about when a key stops being used. -->
      <p class="opacity-70">
        The security policy could not be read, so the rotation interval is unknown.
      </p>
    {:else}
      <div class="flex justify-between gap-2">
        <dt class="opacity-70">interval</dt>
        <dd>{rotation.days} days</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="opacity-70">current key due</dt>
        <dd class:text-warning-500={standing !== 'scheduled'}>{formatMoment(rotation.dueAt)}</dd>
      </div>
      <p class="opacity-70 pt-1">{rotationExplanation(standing)}</p>
    {/if}
  </dl>
</Card>
