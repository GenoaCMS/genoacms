<script lang="ts">
  import type { ActivityRecord } from '$lib/script/activity/types'
  import CollectionsActivity from './CollectionsActivity.svelte'
  import ComponentEntryActivity from './ComponentEntryActivity.svelte'
  import ComponentCodeActivity from './ComponentCodeActivity.svelte'

  interface Props {
    record: ActivityRecord
  }
  const { record }: Props = $props()
</script>

{#if record.type === 'collections'}
  <CollectionsActivity {record} />
{:else if record.type === 'componentEntry'}
  <ComponentEntryActivity {record} />
{:else if record.type === 'componentCode'}
  <ComponentCodeActivity {record} />
{/if}
