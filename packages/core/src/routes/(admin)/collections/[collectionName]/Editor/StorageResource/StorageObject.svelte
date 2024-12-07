<script lang="ts">
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import { Button, Card } from 'flowbite-svelte'

  type Props = {
    resource: ObjectReference
    deleteResource: (i: number) => void
  }
  const { resource, deleteResource }: Props = $props()
</script>

<Card target="_blank" padding="sm" class="min-w-full mb-2">
  <div class="flex">
    <div class="flex-grow whitespace-nowrap">
      Bucket: {resource.bucket}<br>
      Filename: {resource.name}
    </div>
    <div class="w-auto h-auto my-auto">
      <Button onclick={() => deleteResource(resource)}>
        <i class="bi bi-x-circle text-2xl text-warning"></i>
      </Button>
    </div>
  </div>
</Card>
