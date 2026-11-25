<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'

  const { value, label }: { value: string, label: string } = $props()
</script>

<div class={ui.stat}>
  <span class={ui.statValue}>{value}</span>
  <span class={ui.statLabel}>{label}</span>
</div>
