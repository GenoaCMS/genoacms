<script lang="ts">
  import { pages } from './pages'
  import { page } from '$app/state'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
</script>

<div
  class="fixed bottom-0 left-0 w-full z-50 md:hidden block bg-surface-100-900 border-t border-surface-200-800"
>
  <Navigation class="flex w-full justify-around items-center p-2">
    {#each pages as pageItem (pageItem.route)}
      {@const isActive = page.url.pathname.startsWith(pageItem.route)}
      <Navigation.TriggerAnchor
        href={pageItem.route}
        class="flex flex-col items-center">
        <i
          class="bi bi-{pageItem.icon} text-2xl {isActive
            ? 'text-primary-500'
            : 'text-surface-500'}"
        ></i>
        <Navigation.TriggerText class="text-xs">
          {pageItem.name}
        </Navigation.TriggerText>
      </Navigation.TriggerAnchor>
    {/each}
  </Navigation>
</div>
