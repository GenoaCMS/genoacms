<script lang="ts">
  import type { ComponentHeader } from '$lib/script/components/componentHeader/component/types'
  import { activityTracker } from '$lib/script/activity/client'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import DeleteComponent from './DeleteComponent.svelte'
  import AttributeShape from './AttributeShape.svelte'
  import { Button } from '$lib/components/ui/index'

  /**
   * A component authored in the CMS, as the registrar shows it.
   *
   * The registrar describes every component, of either kind — that is what it is for. What differs
   * here is that the description is **read-only**: a dynamic component's attributes are derived from
   * its source each time it is published, so an edit made on this page would be overwritten by the
   * next publication with nothing on screen to say it had been. Showing the shape and saying where
   * it comes from is honest; offering a form that silently loses what is typed into it is not.
   *
   * The way to change this shape is therefore the link below, to the code the shape is read from.
   */
  interface Props {
    id: string
    header: ComponentHeader
  }
  const { id, header }: Props = $props()

  activityTracker.add({
    type: 'componentHeader',
    timestamp: Date.now(),
    componentId: id,
    componentName: header.name,
  })
</script>

<TopPanel>
  <div class="text-2xl">
    Component:
    {header.name}
  </div>
  {#snippet right()}
    <PermissionGate permission="components:register">
      <DeleteComponent name={header.name} />
    </PermissionGate>
  {/snippet}
</TopPanel>

<div class="container mx-auto p-4 space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3 p-4 rounded border border-surface-500/40">
    <p class="text-sm opacity-80">
      This component is coded in the CMS. Its attributes come from its source, so they are changed by
      editing the code and publishing it again.
    </p>
    <PermissionGate permission="components:code">
      <Button preset="filled" href="/components/editor/{id}">Edit the code</Button>
    </PermissionGate>
  </div>

  <AttributeShape {header} />
</div>
