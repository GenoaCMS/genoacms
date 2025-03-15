<script lang="ts">
  import type { ActivityRecord } from '$lib/script/activity/types'
  import CollectionsActivity from './CollectionsActivity.svelte'

  interface Props {
    record: ActivityRecord
  }
  const { record }: Props = $props()
</script>

{#if record.type === 'collections'}
  <CollectionsActivity {record} />
{/if}
