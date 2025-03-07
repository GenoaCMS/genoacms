<script lang="ts">
  import type { LinkMetaSchema, StringMetaSchema } from '$lib/script/components/componentEntry/component/types'
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
  const booleanSchemaInit = {
    type: 'boolean',
    title: '',
    description: '',
    required: false,
    default: false
  }
  const numberSchemaInit = {
    type: 'number',
    title: '',
    description: '',
    minimum: null,
    maximum: null,
    multipleOf: null,
    required: false,
    default: null
  }
  const stringSchemaInit: StringMetaSchema = {
    type: 'string',
    title: '',
    description: '',
    minLength: null,
    maxLength: null,
    pattern: '',
    format: '',
    required: false,
    default: ''
  }
  const linkSchemaInit: LinkMetaSchema = {
    type: 'object',
    properties: {
      isExternal: { type: 'boolean' },
      url: { type: ['string', 'null'] },
      pageName: { type: ['string', 'null'] }
    },
    required: ['isExternal']
  }
  const linksSchemaInit: LinksMetaSchema = {
    type: 'array',
    title: '',
    description: '',
    items: linkSchemaInit,
    default: [],
    minItems: null,
    maxItems: null,
    required: false
  }
  const componentsSchemaInit = {
    type: 'array',
    title: '',
    description: '',
    items: {
      type: 'string'
    },
    default: [],
    minItems: null,
    maxItems: null,
    required: false
  }
  const types = [
    { name: 'boolean', icon: 'toggle-on', schema: booleanSchemaInit },
    { name: 'number', icon: '123', schema: numberSchemaInit },
    { name: 'string', icon: 'type', schema: stringSchemaInit },
    { name: 'text', icon: 'textarea-t', schema: stringSchemaInit },
    { name: 'markdown', icon: 'markdown', schema: stringSchemaInit },
    { name: 'richText', icon: 'file-richtext', schema: stringSchemaInit },
    { name: 'link', icon: 'link-45deg', schema: linksSchemaInit },
    { name: 'storageResource', icon: 'cloud', schema: { type: 'object' } },
    { name: 'components', icon: 'box', schema: componentsSchemaInit }
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
