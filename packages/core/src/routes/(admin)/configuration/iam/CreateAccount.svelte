<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button, Input, Label, Helper } from '$lib/components/ui/index'
  import Portal from '$lib/components/Portal.svelte'
  import RoleSelector from './RoleSelector.svelte'
  import { enhanceWithToast } from './formToast'

  interface Props {
    /** Every role that exists, so the assignment can only name one of them. */
    available: string[]
  }
  const { available }: Props = $props()

  let open = $state(false)
</script>

<button aria-label="Add account" class="h-full flex items-center px-3" onclick={() => { open = true }}>
  <i class="bi bi-person-badge text-2xl hover:text-warning transition-all"></i>
</button>

<Portal>
  <Modal title="Add account" bind:open>
    <div class="flex w-3/4 mx-auto">
      <form
        method="POST"
        action="?/createAccount"
        class="w-full"
        use:enhance={enhanceWithToast('Account added', 'Account not added', () => { open = false })}
      >
        <Label class="text-xl">
          Subject:
          <Input type="text" class="w-full" name="subject" required placeholder="a1b2c3d4-..." />
        </Label>
        <Helper>
          The identifier your authentication provider issues — never an email address. Email
          addresses are reassigned; a subject is not.
        </Helper>

        <Label class="text-xl mt-4">
          Email:
          <Input type="text" class="w-full" name="email" placeholder="shown in the interface only" />
        </Label>

        <p class="text-xl mt-4 mb-2">Roles:</p>
        <RoleSelector {available} />

        <Button preset="tonal" class="w-full mt-4" type="submit">Add</Button>
      </form>
    </div>
  </Modal>
</Portal>
