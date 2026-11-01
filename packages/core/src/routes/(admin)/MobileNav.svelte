<script lang="ts">
  import { pages } from './pages'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
  import PermissionGate from '#lib/components/PermissionGate.svelte'
  import MobileNavItem from './MobileNavItem.svelte'
</script>

<Navigation layout="bar" data-mobile-nav class="shrink-0 md:hidden min-h-(--mobile-nav-height) px-1 border-t border-surface-200-800">
  <Navigation.Menu class="gap-0">
    {#each pages as page (page.route)}
      {#if page.permission}
        <PermissionGate permission={page.permission}>
          <MobileNavItem {...page} />
        </PermissionGate>
      {:else}
        <MobileNavItem {...page} />
      {/if}
    {/each}
  </Navigation.Menu>
</Navigation>
