<script lang="ts">
  import { DarkMode, SpeedDial, SpeedDialButton } from 'flowbite-svelte'
  import { pages } from './pages'
  import Logout from '$lib/components/Logout.svelte'
  console.log(pages)
</script>

<div class="fixed bottom-0 end-0">
  <SpeedDial color="blue">
    <SpeedDialButton>
      <Logout/>
    </SpeedDialButton>
    <SpeedDialButton>
      <DarkMode/>
    </SpeedDialButton>
    {#each pages as page}
      <SpeedDialButton name={page.name} href={page.route}>
        <i class="bi bi-{page.icon} text-2xl h-[2rem] mx-3"/>
      </SpeedDialButton>
    {/each}
  </SpeedDial>
</div>
