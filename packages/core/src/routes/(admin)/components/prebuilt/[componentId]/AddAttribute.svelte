<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import Portal from '$lib/components/Portal.svelte'
  import { Modal } from 'flowbite-svelte'

  let isModalOpen = $state(false)

  interface Props {
    onadd: (attributeInit: Record<string, unknown>) => void
  }
  const { onadd }: Props = $props()
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const types = [
    { name: 'boolean', icon: 'toggle-on', schema: { type: 'boolean' } },
    { name: 'number', icon: '123', schema: { type: 'number' } },
    { name: 'string', icon: 'type', schema: { type: 'string' } },
    { name: 'text', icon: 'textarea-t', schema: { type: 'string' } },
    { name: 'markdown', icon: 'markdown', schema: { type: 'string' } },
    { name: 'richText', icon: 'file-richtext', schema: { type: 'string' } },
    { name: 'link', icon: 'link-45deg', schema: { type: 'string' } },
    { name: 'storageResource', icon: 'cloud', schema: { type: 'object' } },
    { name: 'components', icon: 'box', schema: { type: 'array' } }
  ]
  function add (type: string, schema: Record<string, unknown>) {
    const uid = crypto.randomUUID()
    const init = {
      uid,
      type,
      schema
    }
    onadd(init)
  }

</script>

<button type="button" aria-label="Add attribute" class="h-full flex items-center px-3"
  onclick={toggleModal}>
  <i class="bi bi-plus-circle text-2xl hover:text-warning transition-all"></i>
</button>

<Portal>
  <Modal title="New attribute" bind:open={isModalOpen}>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-2 overflow-auto">
      {#each types as type}
        <CardLink
          icon={type.icon}
          text={type.name}
          onclick={() => {
            add(type.name, type.schema)
            isModalOpen = false
          }}
        />
      {/each}
    </div>
  </Modal>
</Portal>
