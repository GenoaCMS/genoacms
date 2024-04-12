<script lang="ts">
  import Navbar from './Navbar.svelte'
</script>
<div class="h-full grid grid-cols-6 gap-0">
    <div class="bg-light dark:bg-dark-light">
      <Navbar/>
    </div>
    <div class="col-span-5">
        <slot/>
    </div>
</div>
