<script lang="ts">
  import { enhance } from '$app/forms'
  import { Modal, Button, Input, Label, Textarea, Helper } from '$lib/components/ui/index'
  import Portal from '$lib/components/Portal.svelte'

  let open = $state(false)
</script>

<button
  aria-label="New role"
  class="h-full flex items-center px-3"
  onclick={() => { open = true }}
>
  <i class="bi bi-person-plus text-2xl hover:text-warning transition-all"></i>
</button>

<Portal>
  <Modal title="New role" bind:open>
    <form
      method="POST"
      action="?/createRole"
      class="w-3/4 mx-auto space-y-3"
      use:enhance={() => async ({ update }) => {
        await update()
        open = false
      }}
    >
      <div>
        <Label for="role-name">Name</Label>
        <Input id="role-name" name="name" required placeholder="Copywriter" />
      </div>

      <div>
        <Label for="role-grants">Grants</Label>
        <Textarea
          id="role-grants"
          name="grants"
          rows={5}
          required
          value={'[\n  { "permission": "pages:read", "resource": "*" }\n]'}
        />
        <Helper>
          A JSON array. <code>resource</code> is <code>"*"</code> for anywhere, or
          <code>&lbrace; "scope": "bucket", "id": "media" &rbrace;</code> to name one.
        </Helper>
      </div>

      <Button type="submit">Create role</Button>
    </form>
  </Modal>
</Portal>
