import type { TestProject } from 'vitest/node'
import { buildCore } from './build'
import { enabled } from './bucket'

declare module 'vitest' {
  export interface ProvidedContext {
    secretsFile: string
    origin: string
  }
}

/** Builds core once for every end-to-end file, which run one after another against its instance. */
export default async function setup (project: TestProject): Promise<void> {
  if (!enabled) return
  const { secretsFile, origin } = await buildCore()
  project.provide('secretsFile', secretsFile)
  project.provide('origin', origin)
}
