<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button, Input } from '$lib/components/ui/index'

  interface Props {
    subject: string
    current: string[]
  }
  const { subject, current }: Props = $props()

  let open = $state(false)
  // Seeded from what the account holds, so submitting unchanged is a no-op rather than a wipe.
  let names = $state(current.join(', '))
</script>

<Button class="btn-sm" onclick={() => { open = !open }}>
  {open ? 'Cancel' : 'Roles'}
</Button>

{#if open}
  <form
    method="POST"
    action="?/assignRoles"
    class="flex gap-2 items-center w-full mt-2"
    use:enhance={() => async ({ update }) => {
      await update()
      open = false
    }}
  >
    <input type="hidden" name="subject" value={subject} />
    <Input name="roles" bind:value={names} placeholder="Copywriter, Publisher" />
    <Button type="submit" class="btn-sm">Save</Button>
  </form>
{/if}
