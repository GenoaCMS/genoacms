<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import CardLink from '$lib/components/CardLink.svelte'
  import CreateComponentSchema from './CreateComponentSchema.svelte'

  export let data
  $: console.log(data)
</script>

<TopPanel>
    <h1 class="text-2xl">
        Prebuilt component management
    </h1>
    <svelte:fragment slot="right">
        <CreateComponentSchema/>
    </svelte:fragment>
</TopPanel>

<div class="grid grid-cols-6 gap-5 p-5">
    {#each data.components as component}
        <CardLink href="prebuilt/{component}" icon="box" text={component}/>
    {/each}
</div>
