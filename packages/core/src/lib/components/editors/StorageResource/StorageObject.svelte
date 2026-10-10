<script lang="ts">
  import type { ObjectReference } from '@genoacms/contracts/storage'
  import PickedItem from '../PickedItem.svelte'
  import { fileIcon } from './fileIcon'

  type Props = {
    resource: ObjectReference
    deleteResource: (resource: ObjectReference) => void
  }
  const { resource, deleteResource }: Props = $props()
</script>

<PickedItem
  icon={fileIcon(resource.name)}
  title={resource.name}
  subtitle={resource.bucket}
  onremove={() => deleteResource(resource)}
/>
