<script lang="ts">
  import { Card } from '$lib/components/ui/index'
  import type { RootAnchor } from '$lib/script/signing/keyAdministration'

  /**
   * The trust anchor, shown in full.
   *
   * This is the value a consumer SDK embeds, and it is public by construction — verification is
   * what it is for. It is on the screen because an operator setting up a consumer otherwise has to
   * find it in the log line printed once, on the boot that generated it.
   *
   * There is no control here. Replacing the root strands every deployed consumer until it is
   * rebuilt, so it is `genoacms rotate-root` and belongs with whoever can also redeploy them.
   */
  interface Props {
    root: RootAnchor
  }
  const { root }: Props = $props()
</script>

<Card>
  <div class="flex items-start justify-between gap-2 mb-3">
    <h2 class="text-lg">Root trust anchor</h2>
    <span class="font-mono text-xs opacity-70 self-center">{root.alg}</span>
  </div>

  <p class="text-sm opacity-70 mb-3">
    Embed this public key in every consumer SDK. It verifies the key registry, and through it
    everything this instance signs. Replacing it is <code>@genoacms/cli rotate-root</code>, run by
    whoever can redeploy those consumers.
  </p>

  <dl class="text-sm space-y-2">
    <div>
      <dt class="opacity-70">key id</dt>
      <dd class="font-mono break-all">{root.keyId}</dd>
    </div>
    <div>
      <dt class="opacity-70">public key</dt>
      <dd class="font-mono text-xs break-all bg-surface-100-900 rounded p-2">{root.publicKey}</dd>
    </div>
  </dl>
</Card>
