<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import Grid from '$lib/components/Grid.svelte'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import CreateComponent from './CreateComponent.svelte'

  const { data } = $props()
</script>

<TopPanel>
    <h1 class="text-2xl">
      Component editor
    </h1>
    {#snippet right()}
      <CreateComponent createForm={data.createForm}/>
    {/snippet}
</TopPanel>

<Grid>
  {#each data.components as component}
    <CardLink text={component.name} icon="file-earmark-code" href="editor/{component.uid}"/>
  {/each}
</Grid>
