<script lang="ts">
  import { Card } from '$lib/components/ui/index'
  import KeyStateBadge from './KeyStateBadge.svelte'
  import { formatMoment } from './keyPresentation'
  import type { Snippet } from 'svelte'
  import type { AdministrableKey } from '$lib/script/signing/keyAdministration'

  interface Props {
    entry: AdministrableKey
    /** Rendered only when revoking would do something, so the page owns the action and this owns the shape. */
    actions?: Snippet<[AdministrableKey]>
  }
  const { entry, actions }: Props = $props()

  /**
   * The timestamps this key actually has.
   *
   * Built from what is set rather than rendered as a fixed three rows: a current key has no
   * supersession date, and an empty row beside a label reads as missing information.
   *
   * Labelled "…at" rather than by the bare state word. These are moments, and the bare word is
   * already on the card as the badge saying what the key *is* — two different claims that would
   * otherwise be the same string in two places.
   */
  const moments = $derived([
    ['created at', entry.createdAt],
    ...(entry.supersededAt === undefined ? [] : [['superseded at', entry.supersededAt]]),
    ...(entry.revokedAt === undefined ? [] : [['revoked at', entry.revokedAt]])
  ] as Array<[string, number]>)
</script>

<Card class="flex flex-col justify-between h-full overflow-hidden">
  <div>
    <div class="flex items-start justify-between gap-2 mb-3">
      <h3 class="font-mono text-sm break-all" title="Key id, derived from the public key">
        {entry.keyId}
      </h3>
      <KeyStateBadge state={entry.state} />
    </div>

    <dl class="text-sm space-y-1">
      <div class="flex justify-between gap-2">
        <dt class="opacity-70">algorithm</dt>
        <dd class="font-mono">{entry.alg}</dd>
      </div>
      {#each moments as [label, at] (label)}
        <div class="flex justify-between gap-2">
          <dt class="opacity-70">{label}</dt>
          <dd>{formatMoment(at)}</dd>
        </div>
      {/each}
    </dl>
  </div>

  {#if entry.revocable && actions}
    <div class="mt-4 pt-3 border-t border-surface-200-800 flex justify-end items-center">
      {@render actions(entry)}
    </div>
  {/if}
</Card>
