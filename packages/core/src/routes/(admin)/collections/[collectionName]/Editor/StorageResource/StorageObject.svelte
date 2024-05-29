<script lang="ts">
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import { Button, Card } from 'flowbite-svelte'
  import { createEventDispatcher } from 'svelte'

  export let reference: ObjectReference
  const dispatch = createEventDispatcher()

  function deleteReference () {
    dispatch('delete', reference)
  }
</script>

<Card target="_blank" padding="sm" class="min-w-full mb-2">
  <div class="flex">
    <div class="flex-grow whitespace-nowrap">
      Bucket: {reference.bucket}<br>
      Filename: {reference.name}
    </div>
    <div class="w-auto h-auto my-auto">
      <Button on:click={deleteReference}>
        <i class="bi bi-x-circle text-2xl text-warning"></i>
      </Button>
    </div>
  </div>
</Card>
