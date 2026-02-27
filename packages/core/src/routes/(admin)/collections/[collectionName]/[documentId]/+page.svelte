<script lang="ts">
  import type { PageData } from './$types'
  import { activityTracker } from '$lib/script/activity/client'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import Delete from './Delete.svelte'
  import Update from './Update.svelte'
  import Editor from '../Editor/Editor.svelte'
  import { updateDoc } from './update.remote'
  import { toastError, toastSuccess } from '$lib/script/alert'

  const { data }: { data: PageData } = $props()
  const document = $derived(data.document!)

  let documentData = $state(data.document!.data)
  let isSubmitting = $state(false)

  function onvalue (value) {
    documentData = value
  }

  async function handleUpdate () {
    if (isSubmitting) return
    isSubmitting = true
    try {
      const result = await updateDoc({
        collectionName: document.reference.collection.name,
        documentId: document.reference.id,
        documentData
      })
      if (result.status === 'success') {
        toastSuccess(result.text)
      } else {
        toastError(result.text || 'Failed to update document')
        if (result.errors) console.error(result.errors)
      }
    } catch (e: any) {
      toastError(e.message || 'An error occurred')
    } finally {
      isSubmitting = false
    }
  }
  activityTracker.add({
    type: 'collections',
    timestamp: Date.now(),
    collection: document.reference.collection.name,
    document: document.reference.id,
  })
</script>

<TopPanel>
  <h1 class="text-2xl flex flex-wrap">
    <span class="me-2">Update</span>
    <span class="text-warning inline-block truncate max-w-[5ch]"
      >{document.reference.id}</span
    >
    <span class="me-2">of</span>
    <span class="text-warning">{document.reference.collection.name}</span>
  </h1>
  {#snippet right()}
    <Delete />
    <Update onclick={handleUpdate} {isSubmitting} />
  {/snippet}
</TopPanel>

<Editor
  collectionReference={document.reference.collection}
  value={documentData}
  {onvalue}/>
