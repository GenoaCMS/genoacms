<script lang="ts">
  import type { PageData } from './$types'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import DeleteComponent from './DeleteComponent.svelte'
  import Editor from './Editor.svelte'

  const { data }: PageData = $props()
</script>

<TopPanel>
   <h1 class="text-2xl">
       Component: {data.component.name}
   </h1>
    <svelte:fragment slot="right">
      <DeleteComponent deletionForm={data.deletionForm} name={data.component.name}/>
    </svelte:fragment>
</TopPanel>

<Editor changeForm={data.changeForm} language={data.componentDefinition.language}/>
