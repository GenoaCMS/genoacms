<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button } from '$lib/components/ui/index'
  import { enhanceWithToast } from '../formToast'

  /**
   * Rotating on demand.
   *
   * Not a dangerous action, and deliberately not treated as one: the outgoing key stays in the
   * registry and goes on verifying everything it signed, so the worst a stray click costs is one
   * more entry in a list. Asking for confirmation here would put the same weight on it as on
   * revocation, which is the operation that actually breaks things.
   */
  const rotate = enhanceWithToast('Rotated. New signatures use the new key.', 'Key not rotated')
</script>

<form method="POST" action="?/rotate" use:enhance={rotate}>
  <Button type="submit" preset="tonal" title="Mint a new signing key and supersede the current one">
    <i class="bi bi-arrow-repeat"></i> Rotate
  </Button>
</form>
