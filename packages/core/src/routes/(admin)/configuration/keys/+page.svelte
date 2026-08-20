<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import GridLargeItems from '$lib/components/GridLargeItems.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import DangerousAction from '../DangerousAction.svelte'
  import RootAnchorCard from './RootAnchorCard.svelte'
  import RegistrySummary from './RegistrySummary.svelte'
  import KeyCard from './KeyCard.svelte'
  import RotateKey from './RotateKey.svelte'

  const { data } = $props()

  /**
   * Revocation is the one operation on this screen that destroys something, so the warning states
   * the whole consequence rather than asking whether the user is sure. What it costs is not obvious
   * from the word: revocation reaches backwards, and a key's existing signatures are what break.
   */
  const revocationWarning = (keyId: string, isCurrent: boolean): string => [
    `Revoke ${keyId}. Everything it ever signed stops verifying, including signatures made before now.`,
    isCurrent ? 'It is the current key, so a new one is minted first.' : '',
    'Do this for a leaked key. For routine hygiene, rotate instead.'
  ].filter(Boolean).join(' ')
</script>

<TopPanel>
  <h1 class="text-2xl">Signing keys</h1>
  {#snippet right()}
    <PermissionGate permission="config:keys:manage">
      <RotateKey />
    </PermissionGate>
  {/snippet}
</TopPanel>

<div class="p-4 space-y-8">
  <section class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
    <RootAnchorCard root={data.root} />
    <RegistrySummary sequence={data.sequence} rotation={data.rotation} />
  </section>

  <section>
    <h2 class="text-xl mb-3">Subordinate keys</h2>
    <GridLargeItems>
      {#each data.keys as entry (entry.keyId)}
        <KeyCard {entry}>
          {#snippet actions(key)}
            <DangerousAction
              action="?/revoke"
              field="keyId"
              value={key.keyId}
              confirmation={revocationWarning(key.keyId, key.state === 'current')}
              success="Key revoked"
              failure="Key not revoked"
              icon="shield-slash"
              label="Revoke"
              text
            />
          {/snippet}
        </KeyCard>
      {/each}
    </GridLargeItems>
  </section>
</div>
