<script lang="ts">
  import type { LinkMetaSchema, StringMetaSchema, StorageResourceMetaSchema, StorageResourcesMetaSchema } from '$lib/script/components/componentEntry/component/types'
  import { getAttributeTypeIcon } from '$lib/components/components/utils'
  import CardLink from '$lib/components/CardLink.svelte'
  import Portal from '$lib/components/Portal.svelte'
  import { Modal } from '$lib/components/ui/index'

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
  const storageResourceSchemaInit: StorageResourceMetaSchema = {
    type: 'object',
    properties: {
      bucket: {
        type: 'string'
      },
      name: {
        type: 'string'
      }
    },
    required: ['bucket', 'name']
  }
  const storageResourcesSchemaInit: StorageResourcesMetaSchema = {
    type: 'array',
    title: '',
    description: '',
    items: storageResourceSchemaInit,
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
      type: 'string',
      enum: []
    },
    default: [],
    minItems: null,
    maxItems: null,
    required: false
  }
  const types = [
    { name: 'boolean', schema: booleanSchemaInit },
    { name: 'number', schema: numberSchemaInit },
    { name: 'string', schema: stringSchemaInit },
    { name: 'text', schema: stringSchemaInit },
    { name: 'markdown', schema: stringSchemaInit },
    { name: 'richText', schema: stringSchemaInit },
    { name: 'link', schema: linksSchemaInit },
    { name: 'storageResource', schema: storageResourcesSchemaInit },
    { name: 'components', schema: componentsSchemaInit }
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

<button
  type="button"
  aria-label="Add attribute"
  class="h-full flex items-center px-3 cursor-pointer"
  onclick={toggleModal}>
  <i class="bi bi-plus-circle text-2xl hover:text-warning transition-all"></i>
</button>

<Portal>
  <Modal title="New attribute" bind:open={isModalOpen}>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-2 overflow-auto">
      {#each types as type (type.name)}
        {@const icon = getAttributeTypeIcon(type.name)}
        <CardLink
          icon={icon.icon}
          text={type.name}
          class="text-{icon.color}"
          onclick={() => {
            add(type.name, type.schema)
            isModalOpen = false
          }}
        />
      {/each}
    </div>
  </Modal>
</Portal>
