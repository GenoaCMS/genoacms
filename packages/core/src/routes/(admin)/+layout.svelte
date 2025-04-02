<script lang="ts">
  import Navbar from './Navbar.svelte'
  import MobileNav from './MobileNav.svelte'

  interface Props {
    children?: Snippet
  }
  const { children }: Props = $props()
</script>

<div class="h-full flex gap-0">
    <div class="bg-light dark:bg-dark-light hidden md:block w-[30rem]">
      <Navbar/>
    </div>
    <div class="w-full overflow-scroll">
      {@render children?.()}
    </div>
</div>
<MobileNav/>
