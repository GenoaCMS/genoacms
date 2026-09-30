import type { LambdaClient } from '@aws-sdk/client-lambda'

export interface FunctionOperations {
  lookup: () => Promise<boolean>
  create: () => Promise<void>
  update: () => Promise<void>
  ensurePublicUrl: () => Promise<void>
  functionUrl: () => Promise<string>
}

export function createFunctionOperations (_lambda: LambdaClient, _options: object, _key: string): FunctionOperations {
  throw new Error('not implemented')
}
