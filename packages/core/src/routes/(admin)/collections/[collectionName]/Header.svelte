<script lang="ts">
  import type { CollectionReference } from '@genoacms/cloudabstraction/database'
  import { extractDocumentProperties } from './utils'
  import { SELECTION_GUTTER } from '$lib/script/selection/gutter'

  interface Props {
    collectionReference: CollectionReference
  }

  const { collectionReference }: Props = $props()
  const properties = $derived(extractDocumentProperties(collectionReference, { preview: true }))
</script>

<div class="bg-surface-100-900/40 text-start flex border-b border-s border-surface-200-800 py-2 font-medium text-xs">
    <!-- Matches the column each row keeps for its checkbox, so the labels sit over their values. -->
    <div class="{SELECTION_GUTTER} shrink-0"></div>
    {#each properties as property (property.name)}
        <!-- The same padding a row's cell carries, for the same reason: only then does a label line
             up with the values under it rather than with the column's edge. -->
        <div class="flex-grow w-full px-4">
            {property.name}
        </div>
    {/each}
</div>
