<script lang="ts">
    import Logout from '$lib/components/Logout.svelte'
    import NavbarItem from './NavbarItem.svelte'
    import { DarkMode } from '$lib/components/ui/index'
    import { pages } from './pages'
    import PermissionGate from '$lib/components/PermissionGate.svelte'

</script>

<div class="sticky top-0 h-screen flex flex-col justify-between p-4 w-56 lg:w-64">
  <div class="my-auto space-y-1.5">
    {#each pages as page (page.route)}
      {#if page.permission}
        <PermissionGate permission={page.permission}>
          <NavbarItem {...page}/>
        </PermissionGate>
      {:else}
        <NavbarItem {...page}/>
      {/if}
    {/each}
  </div>
  <div class="flex justify-between items-center pt-4 border-t border-surface-200-800">
    <DarkMode/>
    <Logout/>
  </div>
</div>
