<script lang="ts">
  import type {
    AttributeReference,
    Attribute as AttributeT,
  } from '$lib/script/components/componentEntry/component/types'
  import { activityTracker } from '$lib/script/activity/client'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import ChangeName from './ChangeName.svelte'
  import Submit from './Submit.svelte'
  import Redo from './Redo.svelte'
  import Undo from './Undo.svelte'
  import Attribute from './Editor/Attribute.svelte'
  import AddAttribute from './AddAttribute.svelte'
  import DeleteComponent from './DeleteComponent.svelte'
  import Sortable from '$lib/components/Sortable.svelte'
  import { updateComponent } from './update.remote.js'
    import { toastError, toastSuccess } from '$lib/script/alert'

  const { data } = $props()
  const form = $state(data.componentEntry)

  async function submit () {
    const result = await updateComponent(form)
    if (result.status === 'success') {
      toastSuccess(result.text)
    } else {
      toastError(result.text)
    }
  }
  function addAttribute (attribute: AttributeT) {
    form.attributes[attribute.uid] = attribute
    form.attributeOrder.push(attribute.uid)
  }
  function updateAttribute (attribute: AttributeT) {
    form.attributes[attribute.uid] = attribute
  }
  function deleteAttribute (uid: string) {
    delete form.attributes[uid]
    form.attributeOrder = form.attributeOrder.filter((id) => id !== uid)
  }
  function reorder (newOrder: Array<AttributeReference>) {
    form.attributeOrder = newOrder
  }
  activityTracker.add({
    type: 'componentEntry',
    timestamp: Date.now(),
    componentId: data.id,
    componentName: form.name,
  })
</script>

<TopPanel>
  <div class="text-2xl">
    Component:
    {form.name}
  </div>
  {#snippet right()}
    <DeleteComponent name={form.name} />
    <ChangeName bind:name={form.name} onrename={submit} />
    <Undo />
    <Redo />
    <AddAttribute onadd={addAttribute} />
    <Submit />
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
