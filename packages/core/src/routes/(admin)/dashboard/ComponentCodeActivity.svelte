<script lang="ts">
  import type { ComponentCodeActivityRecord } from '$lib/script/activity/types'
  import CardLink from '$lib/components/CardLink.svelte'

  interface Props {
    record: ComponentCodeActivityRecord
  }
  const { record }: Props = $props()
</script>

<CardLink
  text="Component {record.componentName}"
  icon="code-square"
  href="/components/editor/{record.componentId}"
/>
