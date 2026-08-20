<script lang="ts">
  import type { CollectionReference } from '@genoacms/cloudabstraction/database'
  import { extractDocumentProperties } from './utils'

  interface Props {
    collectionReference: CollectionReference
  }

  const { collectionReference }: Props = $props()
  const properties = $derived(extractDocumentProperties(collectionReference, { preview: true }))
</script>

<div class="bg-surface-100-900/40 text-start flex border-b border-s border-surface-200-800 px-4 py-2 font-medium text-xs">
    {#each properties as property (property.name)}
        <div class="flex-grow w-full">
            {property.name}
        </div>
    {/each}
</div>
