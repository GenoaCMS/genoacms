<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { Button, Input, Label } from '$lib/components/ui/index'
  import type { SubmitFunction } from '@sveltejs/kit'

  let isSubmitting = $state(false)

  const handleEnhance: SubmitFunction = ({ cancel }) => {
    if (isSubmitting) cancel()
    isSubmitting = true
    return async ({ result }) => {
      isSubmitting = false
      if (result.type === 'success' || result.type === 'redirect') {
        toastSuccess('Component created successfully')
      } else if (result.type === 'failure') {
        toastError(result.data?.text || 'Failed to create a component')
      } else if (result.type === 'error') {
        toastError('An unexpected error occurred')
      }
      applyAction(result)
    }
  }
</script>

<form
  action="?/create"
  method="post"
  use:enhance={handleEnhance}
  class="w-full"
>
  <Label class="pb-2">
    Name:
    <Input type="text" name="name" />
  </Label>
  <Button preset="tonal" class="w-full" type="submit">Create</Button>
</form>
