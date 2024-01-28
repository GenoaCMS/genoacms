<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import File from './File.svelte'
  import DirectoryCreation from './DirectoryCreation.svelte'

  export let data
  console.log(data)
</script>

<TopPanel>
    <h1 class="text-2xl">
        /{data.path}
    </h1>
    <svelte:fragment slot="right">
        <DirectoryCreation/>
    </svelte:fragment>
</TopPanel>

<div class="grid grid-cols-4 gap-5 p-5">
    {#each data.contents as item}
        <div class="col-span-1">
            <File name={item.name}/>
        </div>
    {/each}
</div>
