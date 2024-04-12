<script lang="ts">
    import Logout from '$lib/components/Logout.svelte'
    import NavbarItem from './NavbarItem.svelte'
    import { DarkMode } from 'flowbite-svelte'

    const pages = [
      {
        name: 'Dashboard',
        route: '/dashboard',
        icon: 'columns'
      },
      {
        name: 'Components',
        route: '/components',
        icon: 'bricks'
      },
      {
        name: 'Collections',
        route: '/collections',
        icon: 'collection'
      },
      {
        name: 'Storage',
        route: '/storage',
        icon: 'folder2'
      },
      {
        name: 'Configuration',
        route: '/configuration',
        icon: 'toggles'
      }
    ]
</script>

<div class="sticky z-0 top-0 bottom-0 h-screen flex flex-col justify-center p-5">
  <div class="my-auto">
    {#each pages as page}
      <NavbarItem {...page}/>
    {/each}
  </div>
  <div class="flex justify-between">
    <DarkMode/>
    <Logout/>
  </div>
</div>
