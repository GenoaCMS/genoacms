import type { ComponentEntry, ComponentEntryReference } from './component/types'
import { uploadComponentEntry } from './io.server'

const createComponentEntry = async (creation: ComponentEntryCreation) => {
  const componentEntry: ComponentEntry = {
    uid: crypto.randomUUID(),
    name: creation.name,
    attributes: {},
    history: [],
    future: []
  }
  await uploadComponentEntry(componentEntry)
  return componentEntry
}

export {
  createComponentEntry
}
