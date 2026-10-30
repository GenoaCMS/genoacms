<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button, Input, Label, Helper } from '#lib/components/ui/index.js'
  import { toastError } from '#lib/script/alert.svelte.js'
  import { refusalMessage } from '../refusalMessage'
  import RoleSelector from './RoleSelector.svelte'
  import type { SubmitFunction } from '$app/forms'

  interface Props {
    /** Every role that exists; the server refuses one that exceeds an agent's ceiling. */
    available: string[]
    onissued: (issued: { subject: string, token: string }) => void
  }
  const { available, onissued }: Props = $props()

  let open = $state(false)

  const enhanceCreate: SubmitFunction = () => async ({ result, update }) => {
    if (result.type !== 'success') {
      toastError(refusalMessage(result.type === 'failure' ? result.data?.reason : undefined, 'Agent not created'))
      return
    }
    await update()
    open = false
    onissued(result.data?.issued as { subject: string, token: string })
  }
</script>

<button aria-label="Add agent" class="h-full flex items-center px-3 cursor-pointer" onclick={() => { open = true }}>
  <i class="bi bi-robot text-2xl hover:text-warning-800-200 transition-all"></i>
</button>

<Modal title="Add agent" bind:open>
  <div class="w-full">
    <form method="POST" action="?/createAgent" class="w-full space-y-3" use:enhance={enhanceCreate}>
      <Label class="text-sm font-medium">
        Name:
        <Input type="text" class="w-full mt-1" name="name" required placeholder="site-builder" />
      </Label>
      <Helper>The agent is known as <code>agent:&lt;name&gt;</code>, in lowercase letters, digits and hyphens.</Helper>

      <Label class="text-sm font-medium">
        Label:
        <Input type="text" class="w-full mt-1" name="label" required placeholder="Site builder" />
      </Label>

      <p class="text-sm font-medium pt-2">Roles:</p>
      <RoleSelector {available} />

      <Button preset="filled" class="w-full mt-4" type="submit">Add</Button>
    </form>
  </div>
</Modal>
