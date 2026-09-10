<script lang="ts">
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
  import Logout from '$lib/components/Logout.svelte'
  import NavbarItem from './NavbarItem.svelte'
  import { DarkMode } from '$lib/components/ui/index'
  import { pages } from './pages'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
</script>

<Navigation layout="rail" class="h-screen sticky top-0">
  <Navigation.Content>
    <Navigation.Menu>
      {#each pages as page (page.route)}
        {#if page.permission}
          <PermissionGate permission={page.permission}>
            <NavbarItem {...page} />
          </PermissionGate>
        {:else}
          <NavbarItem {...page} />
        {/if}
      {/each}
    </Navigation.Menu>
  </Navigation.Content>
  <Navigation.Footer class="flex flex-col items-center gap-3 pt-3 border-t border-surface-200-800">
    <DarkMode />
    <Logout />
  </Navigation.Footer>
</Navigation>

