<script lang="ts">
  interface Props {
    query: string
  }
  let { query = $bindable() }: Props = $props()
</script>

<!-- LST-7 -->
<div class="relative w-64 max-w-full">
  <i class="bi bi-search absolute start-3 top-1/2 -translate-y-1/2 text-surface-600-400 pointer-events-none" aria-hidden="true"></i>
  <input class="input ps-9" type="search" aria-label="Filter documents" placeholder="Filter documents" bind:value={query} />
</div>
