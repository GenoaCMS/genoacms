<script lang="ts">
  import type { CollectionReference } from '@genoacms/cloudabstraction/database'
  import { Button, Modal } from '$lib/components/ui/index'
  import Editor from './Editor/Editor.svelte'
  import { createDoc } from './create.remote'
  import { goto } from '$app/navigation'
  import { toastError, toastSuccess } from '$lib/script/alert.svelte'

  interface Props {
    collectionReference: CollectionReference;
  }
  const { collectionReference }: Props = $props()
  let newDocument = $state({})

  let isModalOpen = $state(false)
  let isSubmitting = $state(false)

  function toggleModal () {
    isModalOpen = !isModalOpen
  }

  function onvalue (value) {
    newDocument = value
  }

  async function submit () {
    if (isSubmitting) return
    isSubmitting = true

    try {
      const result = await createDoc({
        collectionName: collectionReference.name,
        documentData: newDocument,
      })
      if (result.status === 'success') {
        toastSuccess(result.text)
        isModalOpen = false
        goto(`./${collectionReference.name}/${result.id}`)
      } else {
        toastError(result.text || 'Failed to create document')
        if (result.errors) console.error(result.errors)
      }
    } catch (e: any) {
      toastError(e.message || 'An error occurred')
    } finally {
      isSubmitting = false
    }
  }
</script>

<button
  class="h-full flex items-center px-3"
  aria-label="New document"
  onclick={toggleModal}
>
  <i
    class="bi bi-plus-square text-2xl hover:text-warning transition-all"
  ></i>
</button>

<Modal bind:open={isModalOpen} title="New document">
  <Editor {collectionReference} {onvalue} />
  <Button preset="filled" class="w-full mt-4"
    type="button"
    onclick={submit}
    disabled={isSubmitting}
  >
    {isSubmitting ? 'Creating...' : 'Create'}
  </Button>
</Modal>
