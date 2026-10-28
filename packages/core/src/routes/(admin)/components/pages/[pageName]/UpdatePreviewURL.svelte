<script lang="ts">
  import { enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import { Button, Input, Label, Modal, } from '$lib/components/ui/index'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
  import type { SubmitFunction } from '@sveltejs/kit'

  interface Props {
    value: string
  }
  let { value }: Props = $props()
  let isModalOpen = $state(false)

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceEdit: SubmitFunction = ({ formData }) => {
    const alert = alertPending('Editing')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        const reason = result.type === 'failure' ? String((result.data as Record<string, unknown> | undefined)?.reason ?? '') : ''
        toastError(reason.startsWith('conflict/modified-since') ? 'Changed elsewhere. Reload to see the latest version.' : 'Edit failed')
        return
      }
      await invalidateAll()
      toastSuccess('Edit successful')
      isModalOpen = false
      const nextValue = formData.get('value')
      if (typeof nextValue === 'string') value = nextValue
    }
  }
</script>

<button class="h-full flex items-center cursor-pointer px-3" onclick={toggleModal} aria-label="Update preview URL">
    <i class="bi bi-input-cursor-text text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Edit preview URL:" bind:open={isModalOpen}>
    <form action="?/changePreviewURL" method="post" use:enhance={enhanceEdit} class="w-full space-y-3">
        <input type="hidden" name="version" value={page.data.version} />
        <Label>
            Preview URL:
            <Input type="url" name="value" {value} class="w-full mt-1"/>
        </Label>
        <Button preset="filled" class="mt-4 w-full" type="submit">
            Save
        </Button>
    </form>
</Modal>
