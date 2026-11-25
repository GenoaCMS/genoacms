<script lang="ts">
  const { value, label }: { value: string, label: string } = $props()
</script>

<div class="site-stat">
  <span class="site-stat__value">{value}</span>
  <span class="site-stat__label">{label}</span>
</div>
