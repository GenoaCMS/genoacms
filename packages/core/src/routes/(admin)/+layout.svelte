<script lang="ts">
  import Navbar from './Navbar.svelte'
  import MobileNav from './MobileNav.svelte'
</script>

<div class="h-full grid grid-cols-12 gap-0">
    <div class="bg-light dark:bg-dark-light hidden md:block md:col-span-4 xl:col-span-2">
      <Navbar/>
    </div>
    <div class="col-span-12 md:col-span-8 xl:col-span-10">
        <slot/>
    </div>
</div>
<MobileNav/>
