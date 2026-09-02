import type { ComponentHeader, ComponentHeaderCreation } from './component/types'
import { uploadComponentHeader } from './io.server'

const createComponentHeader = async (creation: ComponentHeaderCreation) => {
  const componentHeader: ComponentHeader = {
    uid: crypto.randomUUID(),
    type: creation.type,
    name: creation.name,
    attributes: {},
    attributeOrder: []
  }
  await uploadComponentHeader(componentHeader)
  return componentHeader
}

export {
  createComponentHeader
}
