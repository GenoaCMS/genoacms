<script lang="ts">
  import type { PageData } from './$types'
  import { activityTracker } from '#lib/script/activity/client.js'
  import TopPanel from '#lib/components/TopPanel.svelte'
  import Delete from './Delete.svelte'
  import Update from './Update.svelte'
  import PermissionGate from '#lib/components/PermissionGate.svelte'
  import Editor from '../Editor/Editor.svelte'
  import { updateDoc } from './update.remote'
  import { toastError, toastSuccess } from '#lib/script/alert.svelte.js'
  import { onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import UnsavedChangesGuard from '#lib/components/UnsavedChangesGuard.svelte'

  const { data }: { data: PageData } = $props()
  const document = $derived(data.document!)

  let documentData = $state(data.document!.data)
  let isSubmitting = $state(false)
  let isDeleted = $state(false)
  let savedSnapshot = $state(serialize(data.document!.data))
  const isDirty = $derived(serialize(documentData) !== savedSnapshot)

  function serialize (value: unknown): string {
    return JSON.stringify(value)
  }
  function markSaved () {
    savedSnapshot = serialize(documentData)
  }
  function saveOnShortcut (event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
    event.preventDefault()
    handleUpdate()
  }
  onMount(markSaved)

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
        markSaved()
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

<svelte:window onkeydown={saveOnShortcut} />
<UnsavedChangesGuard dirty={isDirty && !isDeleted} />

<TopPanel>
  <h1 class="flex min-w-0 items-baseline gap-2 text-2xl">
    <a href={resolve('/(admin)/collections/[collectionName]', { collectionName: document.reference.collection.name })} class="text-base text-surface-600-400 hover:text-primary-600-400 shrink-0">
      {document.reference.collection.name}
    </a>
    <span class="text-base text-surface-400-600" aria-hidden="true">/</span>
    <span class="truncate font-mono text-xl" title={String(document.reference.id)}>{document.reference.id}</span>
  </h1>
  {#snippet right()}
    <!-- Scoped to this document's collection, which is what the database service checks. -->
    <PermissionGate permission="db:collection:delete" resource={document.reference.collection.name}>
      <Delete ondeleted={() => { isDeleted = true }} />
    </PermissionGate>
    <PermissionGate permission="db:collection:write" resource={document.reference.collection.name}>
      <Update onclick={handleUpdate} {isSubmitting} {isDirty} />
    </PermissionGate>
  {/snippet}
</TopPanel>

<div class="mx-auto w-full max-w-5xl p-4 sm:p-6 pb-16">
  <Editor
    collectionReference={document.reference.collection}
    value={documentData}
    {onvalue}/>
</div>
