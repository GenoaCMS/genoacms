<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button, Input, Label, Helper } from '$lib/components/ui/index'
  import Portal from '$lib/components/Portal.svelte'

  let open = $state(false)
</script>

<button
  aria-label="Add account"
  class="h-full flex items-center px-3"
  onclick={() => { open = true }}
>
  <i class="bi bi-person-badge text-2xl hover:text-warning transition-all"></i>
</button>

<Portal>
  <Modal title="Add account" bind:open>
    <form
      method="POST"
      action="?/createAccount"
      class="w-3/4 mx-auto space-y-3"
      use:enhance={() => async ({ update }) => {
        await update()
        open = false
      }}
    >
      <div>
        <Label for="account-subject">Subject</Label>
        <Input id="account-subject" name="subject" required placeholder="a1b2c3d4-..." />
        <Helper>
          The identifier your authentication provider issues — never an email address. Email
          addresses are reassigned; a subject is not.
        </Helper>
      </div>

      <div>
        <Label for="account-email">Email</Label>
        <Input id="account-email" name="email" placeholder="shown in the interface only" />
      </div>

      <div>
        <Label for="account-roles">Roles</Label>
        <Input id="account-roles" name="roles" placeholder="Copywriter, Publisher" />
        <Helper>Comma separated. Every name must be a role that exists.</Helper>
      </div>

      <Button type="submit">Add account</Button>
    </form>
  </Modal>
</Portal>
