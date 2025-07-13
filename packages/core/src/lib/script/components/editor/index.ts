import type { Component, ComponentCommit, ComponentCommitOrder, ComponentDefinition, ComponentReference } from './types'
import type { ComponentEntry, ComponentType } from '../componentEntry/component/types'

import { deleteComponentEntry, getComponentEntry, uploadComponentEntry } from '../componentEntry/io.server'
import {
  uploadComponent,
  uploadComponentDefinition,
  uploadComponentCommit,
  getComponent,
  getComponentDefiniton,
  listOrCreateComponentList,
  deleteComponentDefinition,
  deleteComponentFile
} from './io'
import diff from 'deep-diff'
import { ComponentDiffError } from './errors'
import { componentCodeToEntry } from './analyzer'

async function createComponentDefinition (uid: string) {
  const emptyComponentDefinition: ComponentDefinition = {
    uid,
    language: 'javascript',
    uncommitedCode: '',
    code: '',
    history: [],
    future: []
  }
  await uploadComponentDefinition(emptyComponentDefinition)
}
async function createComponentEntry (uid: string, type: ComponentType, name: string) {
  const emptyComponentEntry: ComponentEntry = {
    uid,
    type,
    name,
    attributes: {},
    history: [],
    future: []
  }
  await uploadComponentEntry(emptyComponentEntry)
}
async function createComponent (name: string) {
  const uid = crypto.randomUUID()
  const component = {
    uid,
    name
  }

  await createComponentEntry(uid, 'coded', name)
  await createComponentDefinition(uid)
  await uploadComponent(component)

  return uid
}

async function updateComponentDefinition (reference: ComponentReference, updater: (d: ComponentDefinition) => ComponentDefinition, d?: ComponentDefinition): Promise<void> {
  const definition = d || await getComponentDefiniton(reference)
  const updatedDefinition = updater(definition)
  await uploadComponentDefinition(updatedDefinition)
}

async function createComponentCommit (order: ComponentCommitOrder, definition: ComponentDefinition): Promise<ComponentCommit> {
  const codeDiff = diff.diff(definition.code, definition.uncommitedCode)
  if (!codeDiff) throw new ComponentDiffError('no-change', 'No changes between versions')
  const commit: ComponentCommit = {
    uid: crypto.randomUUID(),
    timestamp: Date.now(),
    componentId: order.componentId,
    message: order.message,
    change: codeDiff
  }
  return commit
}

async function commitComponentDefinition (order: ComponentCommitOrder) {
  const [definition, component, entry] = await Promise.all([
    getComponentDefiniton(order.componentId),
    getComponent(order.componentId),
    getComponentEntry(order.componentId)
  ])
  const commit = await createComponentCommit(order, definition)
  console.log('entry', entry, order.componentId)
  const newEntry = componentCodeToEntry(component.name, definition.uncommitedCode, entry)

  await Promise.all([
    updateComponentDefinition(order.componentId, d => {
      d.code = d.uncommitedCode
      d.history.push(commit.uid)
      return d
    }, definition),
    uploadComponentCommit(commit),
    uploadComponentEntry(newEntry)
  ])
}

async function deleteComponent (component: Component): Promise<void> {
  const deletionTasks = [
    deleteComponentDefinition(component.uid),
    deleteComponentEntry(component.uid),
    deleteComponentFile(component.uid)
  ]
  await Promise.all(deletionTasks)
}

export {
  createComponent,
  listOrCreateComponentList,
  getComponent,
  getComponentDefiniton,
  updateComponentDefinition,
  commitComponentDefinition,
  deleteComponent
}
