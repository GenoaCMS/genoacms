<script lang="ts">
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import { Card } from 'flowbite-svelte'

  export let reference: ObjectReference

</script>

<input type="hidden" name="storageResources" value={JSON.stringify(reference)}>
<Card target="_blank" padding="sm" class="w-full mb-2 whitespace-nowrap">
    Bucket: {reference.bucket}<br>
    Filename: {reference.name}
</Card>
