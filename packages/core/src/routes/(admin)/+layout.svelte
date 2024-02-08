<script>
    import NavbarItem from './NavbarItem.svelte'
    import Columns from 'bootstrap-icons/icons/columns.svg'
    import Bricks from 'bootstrap-icons/icons/bricks.svg'
    import Collection from 'bootstrap-icons/icons/collection.svg'
    import Folder2 from 'bootstrap-icons/icons/folder2.svg'
    import Toggles from 'bootstrap-icons/icons/toggles.svg'

    const pages = [
      {
        name: 'Dashboard',
        route: '/dashboard',
        icon: Columns
      },
      {
        name: 'Components',
        route: '/components',
        icon: Bricks
      },
      {
        name: 'Collections',
        route: '/collections',
        icon: Collection
      },
      {
        name: 'Storage',
        route: '/storage',
        icon: Folder2
      },
      {
        name: 'Configuration',
        route: '/configuration',
        icon: Toggles
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
