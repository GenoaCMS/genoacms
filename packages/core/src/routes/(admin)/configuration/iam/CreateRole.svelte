<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button, Input, Label } from '$lib/components/ui/index'
  import GrantEditor from './GrantEditor.svelte'
  import { enhanceWithToast } from './formToast'

  let open = $state(false)
</script>

<button aria-label="New role" class="h-full flex items-center px-3" onclick={() => { open = true }}>
  <i class="bi bi-person-plus text-2xl hover:text-warning transition-all"></i>
</button>

<Modal size="lg" title="New role" bind:open>
  <div class="w-full">
    <form
      method="POST"
      action="?/createRole"
      class="w-full space-y-3"
      use:enhance={enhanceWithToast('Role created', 'Role not created', () => { open = false })}
    >
      <Label class="text-sm font-medium">
        Role name:
        <Input type="text" class="w-full mt-1" name="name" required placeholder="Copywriter" />
      </Label>

      <p class="text-sm font-medium pt-2">Grants:</p>
      <GrantEditor />

      <Button preset="filled" class="w-full mt-4" type="submit">Create</Button>
    </form>
  </div>
</Modal>
