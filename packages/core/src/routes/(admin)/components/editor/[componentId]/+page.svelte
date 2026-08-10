<script lang="ts">
  import type { PageData } from './$types'
  import { activityTracker } from '$lib/script/activity/client'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import DeleteComponent from './DeleteComponent.svelte'
  import Editor from './Editor.svelte'
  import CommitComponent from './CommitComponent.svelte'

  const { data }: { data: PageData } = $props()
  activityTracker.add({
    type: 'componentCode',
    timestamp: Date.now(),
    componentId: data.component.uid,
    componentName: data.component.name,
  })

  let uncommitedCode = $state(
    (data.componentDefinition.uncommitedCode as string) || ''
  )
</script>

<TopPanel>
  <h1 class="text-2xl">
    Component: {data.component.name}
  </h1>
  {#snippet right()}
    <DeleteComponent uid={data.component.uid} name={data.component.name} />
    <CommitComponent
      componentId={data.component.uid}
      {uncommitedCode}
      code={data.componentDefinition.code}
    />
  {/snippet}
</TopPanel>

<Editor
  uid={data.component.uid}
  bind:code={uncommitedCode}
  language={data.componentDefinition.language}
/>
