<script lang="ts">
  import type {
    AttributeReference,
    Attribute as AttributeT,
    ComponentHeader,
  } from '$lib/script/components/componentHeader/component/types'
  import { activityTracker } from '$lib/script/activity/client'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import ChangeName from './ChangeName.svelte'
  import Submit from './Submit.svelte'
  import Redo from './Redo.svelte'
  import Undo from './Undo.svelte'
  import Attribute from './Editor/Attribute.svelte'
  import AddAttribute from './AddAttribute.svelte'
  import DeleteComponent from './DeleteComponent.svelte'
  import CodeLink from './CodeLink.svelte'
  import PublishComponent from './PublishComponent.svelte'
  import PublicationStatus from './PublicationStatus.svelte'
  import Sortable from '$lib/components/Sortable.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import { updateComponent } from './update.remote.js'
  import { toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { tick } from 'svelte'

  /**
   * Editing one component's description, of either kind.
   *
   * Split out of the route so the route can key it on the loaded entry. Undo and redo are form
   * actions that redirect, so `load` re-runs and hands down a different entry — and the working copy
   * below, being `$state` initialized once, would otherwise keep showing the state from before the
   * undo. Re-creating the component on a new entry is what makes the two agree.
   */
  interface Props {
    id: string
    entry: ComponentHeader
    historyLength: number
    futureLength: number
    /** When this component was last published, or `undefined` if it never has been. */
    publishedAt?: number
  }
  const { id, entry, historyLength, futureLength, publishedAt }: Props = $props()

  const form = $state(entry)

  /**
   * When the component was last published, advanced by publishing rather than by reloading.
   *
   * Seeded from `load` and written by the publish control, so the badge answers immediately. Undo
   * and redo navigate and re-create this component, which reseeds it — the same arrangement `depth`
   * uses one field below, and for the same reason.
   */
  let lastPublishedAt = $state(publishedAt)

  /**
   * How deep the history runs, kept locally because saving does not reload the page.
   *
   * Seeded from what `load` returned and advanced by each save. Undo and redo are form actions that
   * navigate, so the component is re-created and this is seeded afresh — which is why it is only
   * ever written here.
   */
  let depth = $state({ historyLength, futureLength })

  async function submit () {
    const result = await updateComponent(form)
    if (result.status !== 'success') {
      toastError(result.text)
      return
    }
    depth = { historyLength: result.historyLength, futureLength: result.futureLength }
    toastSuccess(result.text)
  }
  function addAttribute (attribute: AttributeT) {
    form.attributes[attribute.uid] = attribute
    form.attributeOrder.push(attribute.uid)
  }
  function updateAttribute (attribute: AttributeT) {
    form.attributes[attribute.uid] = attribute
  }
  async function deleteAttribute (uid: string) {
    form.attributeOrder = form.attributeOrder.filter((id) => id !== uid)
    await tick()
    delete form.attributes[uid]
  }
  function reorder (newOrder: Array<AttributeReference>) {
    form.attributeOrder = newOrder
  }
  activityTracker.add({
    type: 'componentHeader',
    timestamp: Date.now(),
    componentId: id,
    componentName: form.name,
  })
</script>

<TopPanel>
  <div class="flex items-center gap-3">
    <div class="text-2xl">
      Component:
      {form.name}
    </div>
    <!-- Beside the name rather than among the controls: it reports a state, and is the one thing
         here a principal who may only read the catalog can still make use of. -->
    <PublicationStatus publishedAt={lastPublishedAt} />
  </div>
  {#snippet right()}
    {#if entry.type === 'dynamic'}
      <PermissionGate permission="components:code">
        <CodeLink {id} />
      </PermissionGate>
    {/if}
    <PermissionGate permission="components:register">
      <DeleteComponent uid={form.uid} name={form.name} />
    </PermissionGate>
    <PermissionGate permission="components:modify">
      <ChangeName bind:name={form.name} onrename={submit} />
      <Undo historyLength={depth.historyLength} />
      <Redo futureLength={depth.futureLength} />
      <AddAttribute onadd={addAttribute} />
      <Submit />
      <!-- Gated on `modify`, which is what publishing demands of every component. A dynamic one
           demands `components:code` as well, and that check is the server's: it depends on the
           stored type, and a gate here would only hide a control the server would refuse. -->
      <PublishComponent
        componentId={id}
        onpublished={(at) => { lastPublishedAt = at }}
      />
    </PermissionGate>
  {/snippet}
</TopPanel>

<div class="container mx-auto">
  <form
    id="update-form"
    onsubmit={(e) => {
      e.preventDefault()
      submit()
    }}
    class="p-4"
  >
    <Sortable data={form.attributeOrder} onorder={reorder} isId>
      {#snippet item(attributeUid)}
        {@const attribute = form.attributes[attributeUid]}
        <Attribute
          {attribute}
          onvalue={updateAttribute}
          ondelete={deleteAttribute}
        />
      {/snippet}
    </Sortable>
  </form>
</div>
