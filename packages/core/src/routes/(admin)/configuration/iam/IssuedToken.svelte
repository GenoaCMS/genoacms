<script lang="ts">
  import { Modal, Button } from '$lib/components/ui/index'

  /**
   * AGT-3: the one time a token is shown. It is not stored anywhere that could show it again.
   */
  interface Props {
    subject: string
    token: string
    onclose: () => void
  }
  const { subject, token, onclose }: Props = $props()

  let open = $state(true)
</script>

<Modal title="Token of {subject}" bind:open {onclose}>
  <div class="w-full space-y-3">
    <p class="text-sm">Copy the token now. It cannot be shown again, only replaced.</p>
    <code class="block font-mono text-xs break-all p-3 rounded preset-tonal-surface border border-surface-200-800 select-all">{token}</code>
    <Button preset="filled" class="w-full" onclick={() => { open = false }}>I have copied it</Button>
  </div>
</Modal>
