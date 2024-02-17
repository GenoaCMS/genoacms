<script>
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

<div class="h-full grid grid-cols-6 gap-0">
    <div class="bg-light">
        <div class="sticky top-0 bottom-0 h-screen z-50 flex flex-col justify-center p-5">
            {#each pages as page}
                <NavbarItem {...page}/>
            {/each}
            <DarkMode/>
        </div>
    </div>
    <div class="col-span-5">
        <slot/>
    </div>
</div>
