<script lang="ts">
  import { resolve } from '$app/paths'
  import PickedItem from '$lib/components/editors/PickedItem.svelte'

  type T = string | number | boolean
  type Props = {
    reference: T
    collectionId: string
    deleteReference: (i: T) => void
  }
  const { reference, collectionId, deleteReference }: Props = $props()
</script>

<PickedItem
  icon="bi-link-45deg"
  title={String(reference)}
  subtitle={collectionId}
  href={resolve(`/collections/${collectionId}/${reference}`)}
  onremove={() => deleteReference(reference)}
/>
