<script lang="ts">
  import { pages } from './pages'
  import { page } from '$app/state'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
</script>

<div
  class="shrink-0 w-full md:hidden block bg-surface-50-950 border-t border-surface-200-800"
>
  <Navigation class="flex w-full justify-around items-center p-2">
    {#each pages as pageItem (pageItem.route)}
      {@const isActive = page.url.pathname.startsWith(pageItem.route)}
      <Navigation.TriggerAnchor
        href={pageItem.route}
        class="flex flex-col items-center">
        <i
          class="bi bi-{pageItem.icon} text-2xl {isActive
            ? 'text-primary-600-400'
            : 'text-surface-600-400'}"
        ></i>
        <Navigation.TriggerText class="text-xs">
          {pageItem.name}
        </Navigation.TriggerText>
      </Navigation.TriggerAnchor>
    {/each}
  </Navigation>
</div>
