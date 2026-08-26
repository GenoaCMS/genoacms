import type { Component, ComponentDefinition, ComponentReference } from './types'
import type { ComponentHeader, ComponentType } from '../componentHeader/component/types'

import { deleteComponentHeader, uploadComponentHeader } from '../componentHeader/io.server'
import {
  uploadComponentDefinition,
  getComponent,
  getComponentDefiniton,
  listOrCreateComponentList,
  deleteComponentDefinition,
} from './io'
import { deleteComponentPublications } from '../publication/io.server'

/**
 * A dynamic component's source: creating it, editing the draft, and destroying it.
 *
 * **Publishing is not here.** It used to be, because only a dynamic component could be published;
 * it is an act on the whole component and a prebuilt one performs it too, so it lives in
 * `publication/`. What is left is authoring, which is what this surface is for.
 */

async function createComponentDefinition (uid: string) {
  const emptyComponentDefinition: ComponentDefinition = {
    uid,
    language: 'typescript',
    body: '',
    publishedBody: '',
    publishedSignature: ''
  }
  await uploadComponentDefinition(emptyComponentDefinition)
}
async function createComponentHeader (uid: string, type: ComponentType, name: string) {
  const emptyComponentHeader: ComponentHeader = {
    uid,
    type,
    name,
    attributes: {},
    attributeOrder: []
  }
  await uploadComponentHeader(emptyComponentHeader)
}
async function createComponent (name: string) {
  const uid = crypto.randomUUID()

  await createComponentHeader(uid, 'dynamic', name)
  await createComponentDefinition(uid)

  return uid
}

async function updateComponentDefinition (reference: ComponentReference, updater: (d: ComponentDefinition) => ComponentDefinition, d?: ComponentDefinition): Promise<void> {
  const definition = d || await getComponentDefiniton(reference)
  const updatedDefinition = updater(definition)
  await uploadComponentDefinition(updatedDefinition)
}

/**
 * Removes a component and everything it produced.
 *
 * Three things. The definition directory holds the source. The header is the component's place in
 * the catalog, and is what the editor lists. The third is everything it published: one directory per
 * publication, each written once and never rewritten, each signed and independently verifiable. Left
 * behind they would keep verifying, for a component that no longer exists.
 *
 * Removed together rather than in sequence, and the whole thing fails if any part does — a partial
 * deletion reported as success is what this replaces.
 */
async function deleteComponent (component: Component): Promise<void> {
  await Promise.all([
    deleteComponentDefinition(component.uid),
    deleteComponentHeader(component.uid),
    deleteComponentPublications(component.uid)
  ])
}

export {
  createComponent,
  listOrCreateComponentList,
  getComponent,
  getComponentDefiniton,
  updateComponentDefinition,
  deleteComponent
}
