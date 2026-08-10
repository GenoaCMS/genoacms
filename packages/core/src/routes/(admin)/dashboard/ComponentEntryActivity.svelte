<script lang="ts">
  import type { ComponentEntryActivityRecord } from '$lib/script/activity/types'
  import CardLink from '$lib/components/CardLink.svelte'

  interface Props {
    record: ComponentEntryActivityRecord
  }
  const { record }: Props = $props()
</script>

<CardLink
  text="Component {record.componentName}"
  icon="boxes"
  href="/components/prebuilt/{record.componentId}"
/>
