<script lang="ts">
  import type { CollectionsActivityRecord } from '$lib/script/activity/types'
  import CardLink from '$lib/components/CardLink.svelte'

  interface Props {
    record: CollectionsActivityRecord
  }
  const { record }: Props = $props()
</script>

<CardLink
  text="Document in {record.collection}"
  icon="collection"
  href="/collections/{record.collection}/{record.document}"
/>
