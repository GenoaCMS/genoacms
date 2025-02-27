<script lang="ts">
  import Navbar from './Navbar.svelte'
  import MobileNav from './MobileNav.svelte'
</script>

<div class="h-full flex gap-0">
    <div class="bg-light dark:bg-dark-light hidden md:block w-[30rem]">
      <Navbar/>
    </div>
    <div class="w-full overflow-scroll">
        <slot/>
    </div>
</div>
<MobileNav/>
