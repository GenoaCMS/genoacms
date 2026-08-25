<script lang="ts">
  import { attributeTypeInits } from '$lib/script/components/componentHeader/component/attributeInits'
  import { getAttributeTypeIcon } from '$lib/components/components/utils'
  import CardLink from '$lib/components/CardLink.svelte'
  import { Modal } from '$lib/components/ui/index'

  let isModalOpen = $state(false)

  interface Props {
    onadd: (attributeInit: Record<string, unknown>) => void
  }
  const { onadd }: Props = $props()
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  function add (type: string, schema: object) {
    const uid = crypto.randomUUID()
    // A prebuilt attribute has no component code to derive a name from, and its user-facing label
    // lives in schema.title, so the uid stands in. `name` is not optional: AttributeBase declares
    // it and the analyzer sets it, and omitting it here made prebuilt attributes a different shape
    // from coded ones — which additionalProperties: false now rejects rather than tolerates.
    const init = {
      uid,
      name: uid,
      type,
      schema
    }
    onadd(init)
  }

</script>

<button
  type="button"
  aria-label="Add attribute"
  class="h-full flex items-center px-3 cursor-pointer"
  onclick={toggleModal}>
  <i class="bi bi-plus-circle text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="New attribute" bind:open={isModalOpen}>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-2 overflow-auto">
    {#each attributeTypeInits as type (type.name)}
      {@const icon = getAttributeTypeIcon(type.name)}
      <CardLink
        icon={icon.icon}
        color={icon.color}
        text={type.name}
        onclick={() => {
          add(type.name, type.schema)
          isModalOpen = false
        }}
      />
    {/each}
  </div>
</Modal>
