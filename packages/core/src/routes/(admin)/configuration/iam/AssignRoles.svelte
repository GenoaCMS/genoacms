<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button } from '$lib/components/ui/index'
  import Portal from '$lib/components/Portal.svelte'
  import RoleSelector from './RoleSelector.svelte'
  import { enhanceWithToast } from './formToast'

  interface Props {
    subject: string
    current: string[]
    available: string[]
  }
  const { subject, current, available }: Props = $props()

  let open = $state(false)
</script>

<Button class="btn-sm" onclick={() => { open = true }}>Roles</Button>

<Portal>
  <Modal title="Roles of {subject}" bind:open>
    <div class="flex w-3/4 mx-auto">
      <form
        method="POST"
        action="?/assignRoles"
        class="w-full"
        use:enhance={enhanceWithToast('Roles assigned', 'Roles not assigned', () => { open = false })}
      >
        <input type="hidden" name="subject" value={subject} />

        <!-- Seeded from what the account holds, so submitting unchanged is a no-op rather than a wipe. -->
        <RoleSelector {available} selected={current} />

        <Button preset="tonal" class="w-full mt-4" type="submit">Save</Button>
      </form>
    </div>
  </Modal>
</Portal>
