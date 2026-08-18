<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button, Textarea, Helper } from '$lib/components/ui/index'
  import Portal from '$lib/components/Portal.svelte'
  import type { Role } from '$lib/script/authorization/roles'

  interface Props {
    role: Role
  }
  const { role }: Props = $props()

  let open = $state(false)
  // Seeded from what the role holds, so the editor shows the truth rather than a blank slate the
  // administrator would have to retype from memory.
  const current = JSON.stringify(role.grants, null, 2)
</script>

<Button class="btn-sm" onclick={() => { open = true }}>Edit</Button>

<Portal>
  <Modal title="Grants of {role.name}" bind:open>
    <form
      method="POST"
      action="?/updateRole"
      class="w-3/4 mx-auto space-y-3"
      use:enhance={() => async ({ update }) => {
        await update()
        open = false
      }}
    >
      <input type="hidden" name="name" value={role.name} />
      <Textarea name="grants" rows={10} required value={current} />
      <Helper>
        This replaces the whole set. Anything removed here stops being granted as soon as the
        cache expires.
      </Helper>
      <Button type="submit">Save grants</Button>
    </form>
  </Modal>
</Portal>
