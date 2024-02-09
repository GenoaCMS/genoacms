<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import CardLink from '$lib/components/CardLink.svelte'

  export let data
  $: console.log(data)
</script>

<TopPanel>
    <h1 class="text-2xl">
        Edit {data.componentName}
    </h1>
</TopPanel>

<div class="grid grid-cols-6 gap-5 p-5">
    <!-- {#each data.components as component} -->
<!--        <CardLink href="prebuilt/{component}" icon="box" text={component}/>-->
<!--     {/each} -->
</div>
