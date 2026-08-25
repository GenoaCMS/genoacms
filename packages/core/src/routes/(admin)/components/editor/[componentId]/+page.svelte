<script lang="ts">
  import type { PageData } from './$types'
  import { activityTracker } from '$lib/script/activity/client'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import DeleteComponent from './DeleteComponent.svelte'
  import Editor from './Editor.svelte'
  import CommitComponent from './CommitComponent.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'

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
    <!-- Deleting destroys the source, so it is governed by the component's existence rather than by
         authoring; committing signs and publishes an executable and is its own permission. -->
    <PermissionGate permission="components:register">
      <DeleteComponent uid={data.component.uid} name={data.component.name} />
    </PermissionGate>
    <PermissionGate permission="components:code">
      <CommitComponent
        componentId={data.component.uid}
        {uncommitedCode}
        code={data.componentDefinition.code}
      />
    </PermissionGate>
  {/snippet}
</TopPanel>

<Editor
  uid={data.component.uid}
  bind:code={uncommitedCode}
  language={data.componentDefinition.language}
/>
