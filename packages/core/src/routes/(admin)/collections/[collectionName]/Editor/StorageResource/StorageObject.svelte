<script lang="ts">
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import { Card } from 'flowbite-svelte'

  export let name: string
  export let reference: ObjectReference

</script>

<Card target="_blank" padding="sm" class="min-w-full mb-2 whitespace-nowrap">
    Bucket: {reference.bucket}<br>
    Filename: {reference.name}
</Card>
