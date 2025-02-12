<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import Grid from '$lib/components/Grid.svelte'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import DeleteComponent from './DeleteComponent.svelte'

  const { data } = $props()
</script>

<TopPanel>
   <h1 class="text-2xl">
       Component: {data.component.name}
   </h1>
    <svelte:fragment slot="right">
      <DeleteComponent deletionForm={data.deletionForm} name={data.component.name}/>
    </svelte:fragment>
</TopPanel>
