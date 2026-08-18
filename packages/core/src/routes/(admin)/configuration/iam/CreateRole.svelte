<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button, Input, Label } from '$lib/components/ui/index'
  import Portal from '$lib/components/Portal.svelte'
  import GrantEditor from './GrantEditor.svelte'
  import { enhanceWithToast } from './formToast'

  let open = $state(false)
</script>

<button aria-label="New role" class="h-full flex items-center px-3" onclick={() => { open = true }}>
  <i class="bi bi-person-plus text-2xl hover:text-warning transition-all"></i>
</button>

<Portal>
  <Modal size="lg" title="New role" bind:open>
    <div class="flex w-3/4 mx-auto">
      <form
        method="POST"
        action="?/createRole"
        class="w-full"
        use:enhance={enhanceWithToast('Role created', 'Role not created', () => { open = false })}
      >
        <Label class="text-xl">
          Name:
          <Input type="text" class="w-full" name="name" required placeholder="Copywriter" />
        </Label>

        <p class="text-xl mt-4 mb-2">Grants:</p>
        <GrantEditor />

        <Button preset="tonal" class="w-full mt-4" type="submit">Create</Button>
      </form>
    </div>
  </Modal>
</Portal>
