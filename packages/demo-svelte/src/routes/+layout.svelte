<script lang="ts">
  import type { Snippet } from 'svelte'
  import { BRAND_HEAD } from '@genoacms/demo-support/brand'

  const { children }: { children: Snippet } = $props()
</script>

<svelte:head>
  {#each BRAND_HEAD as { tag, attrs }, index (index)}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svelte:head>

{@render children()}
