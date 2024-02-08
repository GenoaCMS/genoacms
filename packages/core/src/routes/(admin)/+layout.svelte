<script>
    import NavbarItem from './NavbarItem.svelte'

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
    <div class="bg-light p-5 flex flex-col justify-center">
        {#each pages as page}
            <NavbarItem {...page}/>
        {/each}
    </div>
    <div class="col-span-5">
        <slot/>
    </div>
</div>
