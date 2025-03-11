import type { AttributeType } from '$lib/script/components/componentEntry/component/types'

interface AttributeTypeIcon {
  icon: string,
  color: string
}

function getAttributeTypeIcon (type: AttributeType): AttributeTypeIcon {
  switch (type) {
    case 'boolean':
      return { icon: 'toggle-on', color: 'green-500' }
    case 'number':
      return { icon: '123', color: 'blue-500' }
    case 'string':
      return { icon: 'type', color: 'amber-500' }
    case 'text':
      return { icon: 'textarea-t', color: 'amber-600' }
    case 'markdown':
      return { icon: 'markdown', color: 'cyan-500' }
    case 'richText':
      return { icon: 'file-richtext', color: 'cyan-600' }
    case 'link':
      return { icon: 'link-45deg', color: 'lime-500' }
    case 'storageResource':
      return { icon: 'cloud', color: 'sky-500' }
    case 'components':
      return { icon: 'box', color: 'black' }
  }
}

export { getAttributeTypeIcon }
