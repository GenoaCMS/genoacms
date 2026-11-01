<script lang="ts">
  import { page } from '$app/state'

  interface Props {
    bucketId: string
    path: string
  }
  const { bucketId, path }: Props = $props()
  const rootHref = $derived(`/storage/${bucketId}/contents${page.url.search}`)
</script>

<!-- BRW-1, BRW-3 -->
<h1 class="flex min-w-0 items-baseline gap-2 text-2xl">
  {#if path === ''}
    {bucketId}
  {:else}
    <a href={rootHref} class="shrink-0 text-base text-surface-600-400 hover:text-primary-600-400">{bucketId}</a>
    <span class="text-base text-surface-400-600">/</span>
    <span class="truncate" title={path}>{path}</span>
  {/if}
</h1>
