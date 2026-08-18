<script lang="ts">
  import { enhance } from '$app/forms'
  import { Button } from '$lib/components/ui/index'

  interface Props {
    action: string
    /** Hidden field the action reads: the role name, or the account subject. */
    field: string
    value: string
    label: string
    /** Shown before the request is sent. Removal here revokes real access. */
    confirmation: string
  }
  const { action, field, value, label, confirmation }: Props = $props()
</script>

<form
  method="POST"
  {action}
  use:enhance={({ cancel }) => {
    if (!confirm(confirmation)) cancel()
  }}
>
  <input type="hidden" name={field} {value} />
  <Button type="submit" class="btn-sm preset-tonal-error">{label}</Button>
</form>
