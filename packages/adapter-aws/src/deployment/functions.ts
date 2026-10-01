import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  GetFunctionUrlConfigCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionActiveV2,
  waitUntilFunctionUpdatedV2,
  type LambdaClient
} from '@aws-sdk/client-lambda'
import { isAwsError } from '../shared.js'
import {
  DEFAULT_MEMORY,
  DEFAULT_TIMEOUT_SECONDS,
  functionEnvironment,
  type FunctionSettings
} from './settings.js'

const WAIT_SECONDS = 600
const RUNTIME = 'nodejs22.x'
const HANDLER = 'run.sh'
const WEB_ADAPTER_ACCOUNT = '753240598075'
const WEB_ADAPTER_VERSION = 30

export interface FunctionOptions extends FunctionSettings {
  region: string
  role: string
  artifactBucket: string
  functionName: string
}

export interface FunctionOperations {
  lookup: () => Promise<boolean>
  create: () => Promise<void>
  update: () => Promise<void>
  ensurePublicUrl: () => Promise<void>
  functionUrl: () => Promise<string | undefined>
}

// LMB-9, WS1
const webAdapterLayer = (region: string): string =>
  `arn:aws:lambda:${region}:${WEB_ADAPTER_ACCOUNT}:layer:LambdaAdapterLayerX86:${WEB_ADAPTER_VERSION}`

// LMB-9, LMB-10
function configuration (options: FunctionOptions): {
  Role: string
  Runtime: typeof RUNTIME
  Handler: string
  MemorySize: number
  Timeout: number
  Layers: string[]
  Environment: { Variables: Record<string, string> }
} {
  return {
    Role: options.role,
    Runtime: RUNTIME,
    Handler: HANDLER,
    MemorySize: options.memory ?? DEFAULT_MEMORY,
    Timeout: options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    Layers: [webAdapterLayer(options.region)],
    Environment: { Variables: functionEnvironment(options) }
  }
}

export function createFunctionOperations (lambda: LambdaClient, options: FunctionOptions, key: string): FunctionOperations {
  const FunctionName = options.functionName

  const ignoringConflict = async (send: () => Promise<unknown>): Promise<void> => {
    try {
      await send()
    } catch (error) {
      if (!isAwsError(error, 'ResourceConflictException')) throw error
    }
  }

  // LMB-12
  const failureReason = async (): Promise<string> => {
    const current = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName }))
    return current.LastUpdateStatus === 'Failed'
      ? current.LastUpdateStatusReason ?? 'update failed'
      : current.StateReason ?? current.State ?? 'unknown'
  }

  // LMB-12
  const awaiting = async (wait: () => Promise<unknown>): Promise<void> => {
    try {
      await wait()
    } catch (error) {
      throw new Error(`deploy/function-failed: ${await failureReason()}`, { cause: error })
    }
  }

  const waitActive = async (): Promise<void> => {
    await awaiting(async () => await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: WAIT_SECONDS }, { FunctionName }))
  }

  const waitUpdated = async (): Promise<void> => {
    await awaiting(async () => await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: WAIT_SECONDS }, { FunctionName }))
  }

  // LMB-8
  const lookup = async (): Promise<boolean> => {
    try {
      await lambda.send(new GetFunctionCommand({ FunctionName }))
      return true
    } catch (error) {
      if (isAwsError(error, 'ResourceNotFoundException')) return false
      throw error
    }
  }

  // LMB-9, WS3
  const ensurePublicUrl = async (): Promise<void> => {
    await ignoringConflict(async () => await lambda.send(new CreateFunctionUrlConfigCommand({ FunctionName, AuthType: 'NONE', InvokeMode: 'BUFFERED' })))
    await ignoringConflict(async () => await lambda.send(new AddPermissionCommand({
      FunctionName,
      StatementId: 'FunctionURLAllowPublicAccess',
      Action: 'lambda:InvokeFunctionUrl',
      Principal: '*',
      FunctionUrlAuthType: 'NONE'
    })))
    await ignoringConflict(async () => await lambda.send(new AddPermissionCommand({
      FunctionName,
      StatementId: 'FunctionURLInvokeAllowPublicAccess',
      Action: 'lambda:InvokeFunction',
      Principal: '*',
      InvokedViaFunctionUrl: true
    })))
  }

  // LMB-9
  const create = async (): Promise<void> => {
    await lambda.send(new CreateFunctionCommand({
      FunctionName,
      Architectures: ['x86_64'],
      Code: { S3Bucket: options.artifactBucket, S3Key: key },
      ...configuration(options)
    }))
    await waitActive()
    await ensurePublicUrl()
  }

  // LMB-11
  const update = async (): Promise<void> => {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName, S3Bucket: options.artifactBucket, S3Key: key }))
    await waitUpdated()
    await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName, ...configuration(options) }))
    await waitUpdated()
    await ensurePublicUrl()
  }

  // LMB-13
  const functionUrl = async (): Promise<string | undefined> =>
    (await lambda.send(new GetFunctionUrlConfigCommand({ FunctionName }))).FunctionUrl

  return { lookup, create, update, ensurePublicUrl, functionUrl }
}
