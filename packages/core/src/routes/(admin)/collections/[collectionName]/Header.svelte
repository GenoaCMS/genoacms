<script lang="ts">
  import type { CollectionReference } from '@genoacms/cloudabstraction/database'
  import { extractDocumentProperties } from './utils'

  interface Props {
    collectionReference: CollectionReference
  }

  const { collectionReference }: Props = $props()
  const properties = $derived(extractDocumentProperties(collectionReference, { preview: true }))
</script>

<div class="bg-light dark:bg-transparent text-start flex border-b border-s border-dark dark:border-light px-4">
    {#each properties as property (property.name)}
        <div class="flex-grow w-full">
            {property.name}
        </div>
    {/each}
</div>
