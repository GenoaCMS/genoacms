<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button } from '$lib/components/ui/index'
  import GrantEditor from './GrantEditor.svelte'
  import { enhanceWithToast } from './formToast'
  import type { Role } from '$lib/script/authorization/roles'

  interface Props {
    role: Role
  }
  const { role }: Props = $props()

  let open = $state(false)
</script>

<Button class="btn-sm" onclick={() => { open = true }}>Edit</Button>

<Modal size="lg" title="Grants of {role.name}" bind:open>
  <div class="w-full">
    <form
      method="POST"
      action="?/updateRole"
      class="w-full space-y-3"
      use:enhance={enhanceWithToast('Grants saved', 'Grants not saved', () => { open = false })}
    >
      <input type="hidden" name="name" value={role.name} />

      <!-- Seeded from what the role holds, so the editor shows the truth rather than a blank slate
           the administrator would have to retype from memory. -->
      <GrantEditor grants={role.grants} />

      <p class="text-xs opacity-60">
        This replaces the whole set. Anything removed here stops being granted as soon as the cache
        expires.
      </p>

      <Button preset="filled" class="w-full mt-4" type="submit">Save</Button>
    </form>
  </div>
</Modal>
