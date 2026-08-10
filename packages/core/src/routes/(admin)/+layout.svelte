<script lang="ts">
  import type { Snippet } from 'svelte'
  import Navbar from './Navbar.svelte'
  import MobileNav from './MobileNav.svelte'

  interface Props {
    children?: Snippet
  }
  const { children }: Props = $props()
</script>

<div class="w-full h-full flex gap-0">
    <div class="bg-light dark:bg-dark-light hidden md:block w-auto">
      <Navbar/>
    </div>
    <div class="flex-grow overflow-y-scroll">
      {@render children?.()}
    </div>
</div>
<MobileNav/>
