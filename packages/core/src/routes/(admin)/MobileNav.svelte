<script lang="ts">
  import { DarkMode, SpeedDial, SpeedDialButton } from 'flowbite-svelte'
  import { pages } from './pages'
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
    {#each pages as page}
      <SpeedDialButton name={page.name} href={page.route}>
        <i class="bi bi-{page.icon} text-2xl h-[2rem] mx-3"/>
      </SpeedDialButton>
    {/each}
  </SpeedDial>
</div>
