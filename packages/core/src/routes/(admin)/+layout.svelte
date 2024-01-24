<script>
    const pages = [
      {
        name: 'Dashboard',
        route: 'dashboard'
      },
      {
        name: 'Components',
        route: 'components'
      },
      {
        name: 'Collections',
        route: 'collections'
      },
      {
        name: 'Storage',
        route: 'storage'
      },
      {
        name: 'Configuration',
        route: 'configuration'
      }
    ]
</script>

<div class="h-full grid grid-cols-4 gap-0">
    <div class="bg-light">
        {#each pages as page}
            <a href={page.route} class="block p-4 hover:bg-gray-100">
                {page.name}
            </a>
        {/each}
    </div>
    <div class="col-span-3">
        <slot/>
    </div>
</div>
