<script lang="ts">
  import { page } from '$app/state'
  import { levelsOf, routeOfDirectory } from '#lib/script/storage/browserPaths.js'

  interface Props {
    bucketId: string
    path: string
    delimiter: string
  }
  interface Crumb { name: string, href: string }
  const { bucketId, path, delimiter }: Props = $props()
  let isWhole = $state(false)

  const levels = $derived(levelsOf(path))
  const name = $derived(levels.at(-1)?.slice(0, -1) ?? bucketId)
  const trail: Crumb[] = $derived.by(() => [
    { name: bucketId, href: hrefOf('') },
    ...levels.slice(0, -1).map((level, index) => ({
      name: level.slice(0, -1),
      href: hrefOf(levels.slice(0, index + 1).join(''))
    }))
  ])
  const fitting = $derived(isWhole
    ? 'whitespace-normal break-words'
    : 'truncate @min-[44rem]:whitespace-normal @min-[44rem]:break-words')

  function hrefOf (directory: string): string {
    return `${routeOfDirectory(bucketId, directory, delimiter)}${page.url.search}`
  }
  function toggleWhole () {
    isWhole = !isWhole
  }
</script>

<!-- BRW-1, BRW-3 -->
<div class="flex min-w-0 items-center gap-1">
  <div class="min-w-0 flex-1">
    {#if levels.length > 0}
      <nav aria-label="Path" class="text-sm text-surface-600-400 {fitting}">
        {#each trail as crumb (crumb.href)}
          <a href={crumb.href} class="hover:text-primary-600-400">{crumb.name}</a><span class="px-1 text-surface-400-600" aria-hidden="true">/</span>
        {/each}
      </nav>
    {/if}
    <h1 class="text-2xl {fitting}" title={name}>{name}</h1>
  </div>
  {#if levels.length > 0}
    <button
      type="button"
      class="shrink-0 self-end p-1 @min-[44rem]:hidden"
      aria-label="Show the whole path"
      aria-expanded={isWhole}
      onclick={toggleWhole}
    >
      <i class="bi bi-chevron-down inline-block transition-transform {isWhole ? 'rotate-180' : ''}"></i>
    </button>
  {/if}
</div>
