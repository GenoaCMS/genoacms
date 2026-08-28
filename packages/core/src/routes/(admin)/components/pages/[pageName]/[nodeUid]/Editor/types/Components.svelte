<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type {
    ComponentsAttributeType,
    ComponentHeader,
  } from '$lib/script/components/componentHeader/component/types'
  import type { Schema } from '@exodus/schemasafe'
  import { page } from '$app/state'
  import { enhance } from '$app/forms'
  import { toastError } from '$lib/script/alert.svelte'
  import { invalidateAll } from '$app/navigation'
  import Component from './Component.svelte'
  import Subcomponent from './Subcomponent.svelte'
  import { Card, Modal } from '$lib/components/ui/index'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'
  import NothingToCompose from '$lib/components/components/NothingToCompose.svelte'
  import Sortable from '$lib/components/Sortable.svelte'

  interface Props {
    data: AttributeData<ComponentsAttributeType>
    onvalue: (data: AttributeData<ComponentsAttributeType>['value']) => void
  }
  const { data, onvalue }: Props = $props()
  let isModalOpen = $state(false)
  const allNodes = $derived(page.data.page.contents.nodes)

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  /**
   * The components this slot will accept.
   *
   * An **absent** `items.enum` means "any component", the same as an empty one. Unset constraints are
   * omitted rather than written as an empty value, so a slot declared without a component list has no
   * `enum` key at all — and reading `.length` off it threw, taking the editor down.
   */
  const getPossibleSubcomponents = (
    components: Array<ComponentHeader>,
    dataSchema: Schema
  ) => {
    const allowed = (dataSchema as any).items?.enum
    if (!Array.isArray(allowed) || allowed.length === 0) return components
    return components.filter((component) => allowed.includes(component.name))
  }
  const addComponent = () => {
    isModalOpen = false
    return ({ result }) => {
      if (result.type !== 'success') {
        toastError('Failed to add component')
        return
      }
      invalidateAll()
    }
  }
  function deleteNode (uid: string) {
    const index = data.value.indexOf(uid)
    data.value.splice(index, 1)
    onvalue(data.value)
  }
  /*
   * Drawn from the **composable** catalog, not the whole one: a slot may only be filled
   * with a component that has been published. The slot's own `enum` narrows it further, and the two
   * are different refusals — one says the component cannot be used anywhere yet, the other that this
   * slot does not accept it.
   */
  const possibleSubcomponents = $derived(
    getPossibleSubcomponents(page.data.composableComponents, data.schema)
  )
</script>

<Card size="xl" class="p-4">
  <div class="flex">
    <div class="me-3">
      <AttributeTypeIcon type={data.type} />
    </div>
    <h3 class="text-xl pb-3">
      {data.name}
    </h3>
  </div>
  <div class="flex flex-col">
    <Sortable data={data.value} onorder={onvalue} isId>
      {#snippet item(id)}
        {@const node = allNodes[id]}
        <Subcomponent {node} ondelete={deleteNode} />
      {/snippet}
    </Sortable>
  </div>
  <div class="w-full flex py-3">
    <button
      type="button"
      onclick={toggleModal}
      class="cursor-pointer mx-auto"
      aria-label="Add component"
    >
      <i class="bi bi-plus-circle text-4xl"></i>
    </button>
  </div>
</Card>

<Modal title="Add a new component" bind:open={isModalOpen}>
  {#if page.data.composableComponents.length === 0}
    <!-- Nothing is published at all. Distinguished from the slot accepting none of what is, below. -->
    <NothingToCompose />
  {:else if possibleSubcomponents.length === 0}
    <p class="text-center p-5 opacity-70">
      None of the published components is accepted by this slot.
    </p>
  {/if}
  <div class="w-full grid grid-cols-4 gap-5 p-5">
    {#each possibleSubcomponents as componentSchema (componentSchema.uid)}
      <form
        action="?/addChildNode"
        method="post"
        use:enhance={addComponent}
        class="col-span-1"
      >
        <input type="hidden" name="attributeUID" value={data.uid} />
        <Component schema={componentSchema} />
      </form>
    {/each}
  </div>
</Modal>
