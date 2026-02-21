<script lang="ts">
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import { Button, Card } from 'flowbite-svelte'

  type Props = {
    resource: ObjectReference
    deleteResource: (i: number) => void
  }
  const { resource, deleteResource }: Props = $props()
</script>

<Card target="_top" class="min-w-full mb-2 p-4" onclick={(e) => e.preventDefault()}>
  <div class="flex">
    <div class="flex-grow">
      <div class="flex justify-center items-center">
        <i class="bi bi-bucket text-xl me-4"></i>
        <div class="flex-grow">{resource.bucket}</div>
      </div>
      <div class="flex justify-center items-center">
        <i class="bi bi-input-cursor-text text-xl me-4"></i>
        <div class="flex-grow">{resource.name}</div>
      </div>
    </div>
    <div class="w-auto h-auto my-auto">
      <Button class="cursor-pointer" onclick={() => deleteResource(resource)}>
        <i class="bi bi-x-circle text-2xl text-warning"></i>
      </Button>
    </div>
  </div>
</Card>
