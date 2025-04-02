<script lang="ts">
    import type { CollectionReference } from '@genoacms/cloudabstraction/database'
    import { page } from '$app/state'
    import { Button, Modal } from 'flowbite-svelte'
    import Portal from '$lib/components/Portal.svelte'
    import Editor from './Editor/Editor.svelte'

    interface Props {
      collectionReference: CollectionReference
    }
    const { collectionReference }: Props = $props()

    let isModalOpen = $state(false)
    function toggleModal () {
      isModalOpen = !isModalOpen
    }
</script>

<button class="h-full flex items-center px-3" aria-label="New document" onclick={toggleModal}>
  <i class="bi bi-plus-square text-2xl text-white hover:text-warning transition-all"></i>
</button>

<Portal>
  <Modal open={isModalOpen} title="New document">
      <Editor
        editorForm={page.data.form}
        schema={collectionReference.schema}
        action="?/create"
        onsuccess={toggleModal}
      />
      <Button type="submit" form="document-form" color="light" class="w-full mt-2">
        Create
      </Button>
  </Modal>
</Portal>
