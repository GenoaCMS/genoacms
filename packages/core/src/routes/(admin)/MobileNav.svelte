<script lang="ts">
  import { pages } from './pages'
  import { page } from '$app/state'
  import { DarkMode, SpeedDial, SpeedDialButton } from 'flowbite-svelte'
  import Logout from '$lib/components/Logout.svelte'
</script>

<div class="fixed bottom-0 end-0 md:hidden block">
  <SpeedDial color="blue">
    <SpeedDialButton name="Logout">
      <Logout/>
    </SpeedDialButton>
    <SpeedDialButton name="Color mode">
      <DarkMode/>
    </SpeedDialButton>
    {#each pages as pageItem}
      {@const isActive = page.url.pathname.startsWith(pageItem.route)}
      <SpeedDialButton name={pageItem.name} href={pageItem.route}>
        <i class="bi bi-{pageItem.icon} text-2xl h-[2rem] mx-3 {isActive ? 'text-warning' : ''}"></i>
      </SpeedDialButton>
    {/each}
  </SpeedDial>
</div>
