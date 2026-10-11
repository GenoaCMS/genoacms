import type { TestProject } from 'vitest/node'
import { buildCore } from './server'
import { enabled } from './bucket'

declare module 'vitest' {
  export interface ProvidedContext {
    secretsFile: string
  }
}

/** Builds core once for every end-to-end file, which run one after another against its instance. */
export default function setup (project: TestProject): void {
  if (enabled) project.provide('secretsFile', buildCore())
}
