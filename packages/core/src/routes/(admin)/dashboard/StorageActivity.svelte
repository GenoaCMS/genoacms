<script lang="ts">
  import type { StorageActivityRecord } from '$lib/script/activity/types'
  import CardLink from '$lib/components/CardLink.svelte'

  interface Props {
    record: StorageActivityRecord
  }
  const { record }: Props = $props()
</script>

<CardLink
  text="Directory in {record.bucket}"
  icon="folder"
  href="/storage/{record.bucket}/{record.path}/contents?sessionId={record.sessionId}"
/>
