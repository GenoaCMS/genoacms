<script lang="ts">
  import type { Snippet } from 'svelte'
  import Navbar from './Navbar.svelte'
  import MobileNav from './MobileNav.svelte'

  interface Props {
    children?: Snippet
  }
  const { children }: Props = $props()
</script>

<div class="w-full h-full flex min-h-screen bg-surface-50-950 text-surface-950-50">
    <aside class="hidden md:flex flex-col h-screen shrink-0 bg-surface-100-900/30 border-r border-surface-200-800">
      <Navbar/>
    </aside>
    <main class="flex-grow overflow-y-auto min-w-0">
      {@render children?.()}
    </main>
</div>
<MobileNav/>
