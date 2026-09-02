<script lang="ts">
  import type { ActivityRecord } from '$lib/script/activity/types'
  import CollectionsActivity from './CollectionsActivity.svelte'
  import ComponentHeaderActivity from './ComponentHeaderActivity.svelte'
  import ComponentCodeActivity from './ComponentCodeActivity.svelte'
  import StorageActivity from './StorageActivity.svelte'

  interface Props {
    record: ActivityRecord
  }
  const { record }: Props = $props()
</script>

{#if record.type === 'collections'}
  <CollectionsActivity {record} />
{:else if record.type === 'componentHeader'}
  <ComponentHeaderActivity {record} />
{:else if record.type === 'componentCode'}
  <ComponentCodeActivity {record} />
{:else if record.type === 'storage'}
  <StorageActivity {record} />
{/if}
