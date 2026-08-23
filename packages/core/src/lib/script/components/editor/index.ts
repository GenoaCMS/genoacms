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
import { ComponentCodeError, ComponentDiffError } from './errors'
import { componentNameRefusal, isValidComponentName } from './names'
import { componentCodeToEntry } from './analyzer'
import { compileComponentSource } from './compilation'
import { signComponentExecutable } from '../executable/executable.server'
import { uploadComponentExecutable } from '../executable/io.server'

async function createComponentDefinition (uid: string) {
  const emptyComponentDefinition: ComponentDefinition = {
    uid,
    language: 'typescript',
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
    attributeOrder: [],
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

  await createComponentEntry(uid, 'dynamic', name)
  await createComponentDefinition(uid)
  await uploadComponent(component)

  return uid
}

async function updateComponentDefinition (reference: ComponentReference, updater: (d: ComponentDefinition) => ComponentDefinition, d?: ComponentDefinition): Promise<void> {
  const definition = d || await getComponentDefiniton(reference)
  const updatedDefinition = updater(definition)
  await uploadComponentDefinition(updatedDefinition)
}

/**
 * Records a revision, and who made it.
 *
 * `authorId` is a parameter rather than something read here, because this module has no principal:
 * the authenticated subject arrives from `user.server.ts`. It is stored on the commit so that the
 * signed executable built from this revision has an author to name, and so that rebuilding an older
 * revision later still knows whose it was.
 */
async function createComponentCommit (order: ComponentCommitOrder, definition: ComponentDefinition, authorId: string): Promise<ComponentCommit> {
  const codeDiff = diff.diff(definition.code, definition.uncommitedCode)
  if (!codeDiff) throw new ComponentDiffError('no-change', 'No changes between versions')
  const commit: ComponentCommit = {
    uid: crypto.randomUUID(),
    timestamp: Date.now(),
    componentId: order.componentId,
    message: order.message,
    authorId,
    change: codeDiff
  }
  return commit
}

/** Everything a commit is built from, read together because none of it is useful alone. */
async function readCommitSubject (componentId: ComponentReference) {
  const [definition, component, entry] = await Promise.all([
    getComponentDefiniton(componentId),
    getComponent(componentId),
    getComponentEntry(componentId)
  ])
  return { definition, component, entry }
}

/**
 * Everything that can refuse a commit, done before anything is written.
 *
 * Analysis, compilation and signing all fail by throwing, and every one of them runs here — so a
 * component that does not analyze, does not compile, or cannot be signed leaves the bucket exactly
 * as it was. The previous revision stays published and the draft stays where the author left it,
 * which is what makes a rejected commit something to fix rather than something to recover from.
 *
 * The alternative — writing as each stage succeeded — would advance the definition past a revision
 * that has no artifact, and the component would read as committed while serving its predecessor.
 */
async function buildRevision (
  { definition, component, entry }: Awaited<ReturnType<typeof readCommitSubject>>,
  commit: ComponentCommit
) {
  // Components created before names were constrained can hold one no source file can declare. The
  // analyzer would report only that no such function exists, which is true and unfixable; saying
  // why is what turns it into something the author can act on.
  if (!isValidComponentName(component.name)) {
    throw new ComponentCodeError('invalid-component-name', componentNameRefusal(component.name))
  }
  const code = definition.uncommitedCode
  const newEntry = await componentCodeToEntry(definition.language, component.name, code, entry)
  const compiled = await compileComponentSource(definition.language, component.name, code)
  const executable = await signComponentExecutable(
    {
      uid: component.uid,
      commitId: commit.uid,
      authorId: commit.authorId,
      committedAt: commit.timestamp
    },
    compiled.platform,
    compiled.executableCode
  )
  return { newEntry, executable }
}

/**
 * Publishes what was built.
 *
 * The executable is written **first**, and alone. Object storage has no transaction, so the writes
 * cannot be one act; what can be chosen is which failure is survivable. An artifact with no
 * definition pointing at it is unreferenced and harmless — the next commit supersedes it. A
 * definition advanced past an artifact that was never written is a component that reports a revision
 * nothing can serve.
 */
async function publishRevision (
  definition: ComponentDefinition,
  commit: ComponentCommit,
  { newEntry, executable }: Awaited<ReturnType<typeof buildRevision>>
): Promise<void> {
  await uploadComponentExecutable(executable)
  await Promise.all([
    updateComponentDefinition(commit.componentId, d => {
      d.code = d.uncommitedCode
      d.history.push(commit.uid)
      return d
    }, definition),
    uploadComponentCommit(commit),
    uploadComponentEntry(newEntry)
  ])
}

/**
 * Commits the draft: analyze, compile, sign, write.
 *
 * The order is the point. Everything that can refuse runs before anything is written, so the bucket
 * only ever moves from one complete revision to the next.
 */
async function commitComponentDefinition (order: ComponentCommitOrder, authorId: string) {
  const subject = await readCommitSubject(order.componentId)
  const commit = await createComponentCommit(order, subject.definition, authorId)
  const built = await buildRevision(subject, commit)
  await publishRevision(subject.definition, commit, built)
}

async function deleteComponent (component: Component): Promise<void> {
  // TODO: fix
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
