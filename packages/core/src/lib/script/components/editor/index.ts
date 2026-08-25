import type { Component, ComponentCommit, ComponentCommitOrder, ComponentDefinition, ComponentReference } from './types'
import type { ComponentHeader, ComponentType } from '../componentHeader/component/types'

import { deleteComponentHeader, getComponentHeader, uploadComponentHeader } from '../componentHeader/io.server'
import {
  uploadComponentDefinition,
  uploadComponentCommit,
  getComponent,
  getComponentDefiniton,
  listOrCreateComponentList,
  deleteComponentDefinition,
} from './io'
import diff from 'deep-diff'
import { ComponentCodeError, ComponentDiffError } from './errors'
import { componentNameRefusal, isValidComponentName } from './names'
import { componentCodeToHeader } from './analyzer'
import { compileComponentSource } from './compilation'
import { signComponentExecutable } from '../executable/executable.server'
import { deleteComponentExecutables, uploadComponentExecutable } from '../executable/io.server'

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
  const [definition, component, header] = await Promise.all([
    getComponentDefiniton(componentId),
    getComponent(componentId),
    getComponentHeader(componentId)
  ])
  return { definition, component, header }
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
  { definition, component, header }: Awaited<ReturnType<typeof readCommitSubject>>,
  commit: ComponentCommit
) {
  // Components created before names were constrained can hold one no source file can declare. The
  // analyzer would report only that no such function exists, which is true and unfixable; saying
  // why is what turns it into something the author can act on.
  if (!isValidComponentName(component.name)) {
    throw new ComponentCodeError('invalid-component-name', componentNameRefusal(component.name))
  }
  const code = definition.uncommitedCode
  const newHeader = await componentCodeToHeader(definition.language, component.name, code, header)
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
  return { newHeader, executable }
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
  { newHeader, executable }: Awaited<ReturnType<typeof buildRevision>>
): Promise<void> {
  await uploadComponentExecutable(executable)
  await Promise.all([
    updateComponentDefinition(commit.componentId, d => {
      d.code = d.uncommitedCode
      d.history.push(commit.uid)
      return d
    }, definition),
    uploadComponentCommit(commit),
    uploadComponentHeader(newHeader)
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

/**
 * Removes a component and everything it produced.
 *
 * Three things. The definition directory holds the source **and every commit**, so those go with it.
 * The header is the component's place in the catalog, and is what the editor lists. The third is the
 * published executables: one per commit, each written once and never rewritten, each signed and
 * independently verifiable. Left behind they would keep verifying, for a component that no longer
 * exists.
 *
 * Removed together rather than in sequence, and the whole thing fails if any part does — a partial
 * deletion reported as success is what this replaces.
 */
async function deleteComponent (component: Component): Promise<void> {
  await Promise.all([
    deleteComponentDefinition(component.uid),
    deleteComponentHeader(component.uid),
    deleteComponentExecutables(component.uid)
  ])
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
