import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockClient } from 'aws-sdk-client-mock'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import {
  LambdaClient,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
  AddPermissionCommand,
  ResourceNotFoundException,
  ResourceConflictException,
  waitUntilFunctionActiveV2,
  waitUntilFunctionUpdatedV2
} from '@aws-sdk/client-lambda'
import procedure from './procedure.js'

const { constructed, execFile, childProcessWith } = vi.hoisted(() => {
  const execFile = vi.fn((...args: unknown[]) => {
    const callback = args.at(-1)
    if (typeof callback === 'function') callback(null, '', '')
    return {}
  })
  const childProcessWith = async (original: typeof import('node:child_process')) => {
    const { promisify } = await import('node:util')
    Object.assign(execFile, {
      [promisify.custom]: async (file: string, args: string[], options: object) => await new Promise((resolve, reject) => {
        execFile(file, args, options, (error: unknown, stdout: string, stderr: string) => { error != null ? reject(error) : resolve({ stdout, stderr }) })
      })
    })
    return { ...original, execFile, default: { ...original, execFile } }
  }
  return { constructed: [] as Array<{ service: string, config: any }>, execFile, childProcessWith }
})

vi.mock('node:child_process', async (importOriginal) => await childProcessWith(await importOriginal()))
vi.mock('child_process', async (importOriginal) => await childProcessWith(await importOriginal()))

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  class RecordingS3Client extends original.S3Client {
    constructor (...args: ConstructorParameters<typeof original.S3Client>) {
      super(...args)
      constructed.push({ service: 's3', config: args[0] })
    }
  }
  return { ...original, S3Client: RecordingS3Client }
})

vi.mock('@aws-sdk/client-lambda', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-lambda')>()
  class RecordingLambdaClient extends original.LambdaClient {
    constructor (...args: ConstructorParameters<typeof original.LambdaClient>) {
      super(...args)
      constructed.push({ service: 'lambda', config: args[0] })
    }
  }
  return { ...original, LambdaClient: RecordingLambdaClient, waitUntilFunctionActiveV2: vi.fn(), waitUntilFunctionUpdatedV2: vi.fn() }
})

const s3 = mockClient(S3Client)
const lambda = mockClient(LambdaClient)

const ROLE = 'arn:aws:iam::123456789012:role/genoacms'
const LAYER = 'arn:aws:lambda:eu-central-1:753240598075:layer:LambdaAdapterLayerX86:30'
const ARTIFACT_KEY = '.genoacms/deployment/genoacms.zip'
const FUNCTION_URL = 'https://abc.lambda-url.eu-central-1.on.aws/'
const BASE = { region: 'eu-central-1', role: ROLE, artifactBucket: 'artifacts' }
const NPM_ARGS = ['install', '--omit=dev', '--no-audit', '--no-fund', '--os=linux', '--cpu=x64', '--libc=glibc']
const BASE_ENVIRONMENT = {
  NODE_ENV: 'production',
  AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
  PORT: '8080',
  ADDRESS_HEADER: 'x-genoacms-client-address'
}
const FORWARDED_ENVIRONMENT = { ...BASE_ENVIRONMENT, PROTOCOL_HEADER: 'x-forwarded-proto', HOST_HEADER: 'host' }

type Answer = (input: any) => unknown
const LAMBDA_COMMANDS: Array<[string, new (...args: any[]) => any]> = [
  ['GetFunction', GetFunctionCommand],
  ['GetFunctionConfiguration', GetFunctionConfigurationCommand],
  ['CreateFunction', CreateFunctionCommand],
  ['UpdateFunctionCode', UpdateFunctionCodeCommand],
  ['UpdateFunctionConfiguration', UpdateFunctionConfigurationCommand],
  ['CreateFunctionUrlConfig', CreateFunctionUrlConfigCommand],
  ['GetFunctionUrlConfig', GetFunctionUrlConfigCommand],
  ['AddPermission', AddPermissionCommand]
]

const log: string[] = []
let answers: Record<string, Answer> = {}
const roots: string[] = []

const notFound = (): ResourceNotFoundException => new ResourceNotFoundException({ message: 'not found', $metadata: {} })
const conflict = (): ResourceConflictException => new ResourceConflictException({ message: 'exists', $metadata: {} })
const awsError = (name: string): Error => Object.assign(new Error(name), { name })

function defaultAnswers (): Record<string, Answer> {
  return {
    PutObject: () => ({}),
    GetFunction: () => { throw notFound() },
    GetFunctionConfiguration: () => ({}),
    CreateFunction: () => ({}),
    UpdateFunctionCode: () => ({}),
    UpdateFunctionConfiguration: () => ({}),
    CreateFunctionUrlConfig: () => ({ FunctionUrl: FUNCTION_URL }),
    GetFunctionUrlConfig: () => ({ FunctionUrl: FUNCTION_URL }),
    AddPermission: () => ({})
  }
}

function answerAndLog (name: string): (input: any) => Promise<unknown> {
  return async (input) => {
    log.push(name)
    return answers[name](input)
  }
}

function functionExists (): void {
  answers.GetFunction = () => ({ Configuration: { FunctionName: 'genoacms', State: 'Active', LastUpdateStatus: 'Successful' } })
}

function deployContext () {
  const root = mkdtempSync(join(tmpdir(), 'genoa-aws-procedure-'))
  roots.push(root)
  const buildDir = join(root, 'build')
  const workDir = join(root, 'work')
  mkdirSync(buildDir)
  mkdirSync(workDir)
  writeFileSync(join(buildDir, 'package.json'), JSON.stringify({ name: 'genoacms-runtime', type: 'module' }))
  writeFileSync(join(buildDir, 'index.js'), 'console.log("server")\n')
  return { projectRoot: root, buildDir, workDir, target: 'aws' }
}

async function deploy (options: Record<string, unknown> = {}) {
  const ctx = deployContext()
  await procedure({ ...BASE, ...options } as never, ctx)
  return ctx
}

async function failure (options: Record<string, unknown> = {}): Promise<any> {
  return await deploy(options).then(() => { throw new Error('the deploy resolved') }, (error: unknown) => error)
}

const inputsOf = (command: new (...args: any[]) => any): any[] => lambda.commandCalls(command).map(call => call.args[0].input)
const at = (entry: string, from = 0): number => log.indexOf(entry, from)

beforeEach(() => {
  for (const variable of ['AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE']) vi.stubEnv(variable, join(tmpdir(), 'genoa-aws-no-such-file'))
  vi.stubEnv('AWS_EC2_METADATA_DISABLED', 'true')
  s3.reset()
  lambda.reset()
  execFile.mockClear()
  constructed.length = 0
  log.length = 0
  answers = defaultAnswers()
  s3.on(PutObjectCommand).callsFake(answerAndLog('PutObject'))
  for (const [name, command] of LAMBDA_COMMANDS) lambda.on(command).callsFake(answerAndLog(name))
  vi.mocked(waitUntilFunctionActiveV2).mockReset().mockImplementation(async () => { log.push('wait:active'); return { state: 'SUCCESS' } as never })
  vi.mocked(waitUntilFunctionUpdatedV2).mockReset().mockImplementation(async () => { log.push('wait:updated'); return { state: 'SUCCESS' } as never })
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

afterAll(async () => {
  await new Promise(resolve => setImmediate(resolve))
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true })
})

describe('the AWS deploy procedure', () => {
  it('LMB-5: runs npm install with the Linux x64 arguments', async () => {
    const { workDir } = await deploy()
    const npm = execFile.mock.calls.filter(call => call[0] === 'npm')
    expect(npm).toHaveLength(1)
    expect(npm[0][1]).toEqual(NPM_ARGS)
    expect(npm[0][2]).toMatchObject({ cwd: join(workDir, 'app') })
    expect((npm[0][2] as { shell?: unknown }).shell).toBeFalsy()
  })

  it("LMB-7: uploads the archive under the function's key, and stops on failure", async () => {
    await deploy()
    expect(s3.commandCalls(PutObjectCommand).map(call => call.args[0].input)).toEqual([
      expect.objectContaining({ Bucket: 'artifacts', Key: ARTIFACT_KEY })
    ])

    lambda.resetHistory()
    const denied = new Error('denied')
    answers.PutObject = () => { throw denied }
    const error = await failure()
    expect(error.message).toBe('deploy/upload-failed: denied')
    expect(error.cause).toBe(denied)
    expect(lambda.calls()).toHaveLength(0)
  })

  it('LMB-8: treats only ResourceNotFoundException as absent', async () => {
    const denied = awsError('AccessDeniedException')
    answers.GetFunction = () => { throw denied }
    expect(await failure()).toBe(denied)
    expect(log).not.toContain('CreateFunction')
    expect(log).not.toContain('UpdateFunctionCode')
  })

  it('LMB-9, LMB-10: creates the function with the adapter layer, waits, then opens its URL', async () => {
    await deploy()
    expect(inputsOf(CreateFunctionCommand)).toEqual([{
      FunctionName: 'genoacms',
      Role: ROLE,
      Runtime: 'nodejs22.x',
      Architectures: ['x86_64'],
      Handler: 'run.sh',
      MemorySize: 1024,
      Timeout: 30,
      Code: { S3Bucket: 'artifacts', S3Key: ARTIFACT_KEY },
      Layers: [LAYER],
      Environment: { Variables: FORWARDED_ENVIRONMENT }
    }])
    expect(waitUntilFunctionActiveV2).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ FunctionName: 'genoacms' }))
    expect(at('CreateFunction')).toBeGreaterThanOrEqual(0)
    expect(at('wait:active')).toBeGreaterThan(at('CreateFunction'))
    expect(at('CreateFunctionUrlConfig')).toBeGreaterThan(at('wait:active'))
    expect(inputsOf(CreateFunctionUrlConfigCommand)).toEqual([
      expect.objectContaining({ FunctionName: 'genoacms', AuthType: 'NONE', InvokeMode: 'BUFFERED' })
    ])
    const permissions = inputsOf(AddPermissionCommand)
    expect(permissions).toHaveLength(2)
    expect(permissions).toContainEqual(expect.objectContaining({
      FunctionName: 'genoacms',
      StatementId: 'FunctionURLAllowPublicAccess',
      Action: 'lambda:InvokeFunctionUrl',
      Principal: '*',
      FunctionUrlAuthType: 'NONE'
    }))
    expect(permissions).toContainEqual(expect.objectContaining({
      FunctionName: 'genoacms',
      StatementId: 'FunctionURLInvokeAllowPublicAccess',
      Action: 'lambda:InvokeFunction',
      Principal: '*',
      InvokedViaFunctionUrl: true
    }))
    expect(at('AddPermission')).toBeGreaterThan(at('wait:active'))
  })

  it('LMB-9: tolerates an existing URL and existing statements', async () => {
    answers.CreateFunctionUrlConfig = () => { throw conflict() }
    answers.AddPermission = () => { throw conflict() }
    await expect(deploy()).resolves.toBeDefined()
    expect(log.filter(entry => entry === 'AddPermission')).toHaveLength(2)
  })

  it('LMB-10: sets ORIGIN instead of the forwarded headers when origin is given', async () => {
    await deploy({ origin: 'https://cms.example' })
    expect(inputsOf(CreateFunctionCommand)[0].Environment).toEqual({ Variables: { ...BASE_ENVIRONMENT, ORIGIN: 'https://cms.example' } })
  })

  it('LMB-11: updates code, then the whole configuration, waiting after each', async () => {
    functionExists()
    await deploy()
    expect(log).not.toContain('CreateFunction')
    expect(inputsOf(UpdateFunctionCodeCommand)).toEqual([
      expect.objectContaining({ FunctionName: 'genoacms', S3Bucket: 'artifacts', S3Key: ARTIFACT_KEY })
    ])
    expect(inputsOf(UpdateFunctionConfigurationCommand)).toEqual([{
      FunctionName: 'genoacms',
      Role: ROLE,
      Runtime: 'nodejs22.x',
      Handler: 'run.sh',
      MemorySize: 1024,
      Timeout: 30,
      Layers: [LAYER],
      Environment: { Variables: FORWARDED_ENVIRONMENT }
    }])
    const code = at('UpdateFunctionCode')
    const firstWait = at('wait:updated', code)
    const configuration = at('UpdateFunctionConfiguration')
    const secondWait = at('wait:updated', configuration)
    expect(code).toBeGreaterThanOrEqual(0)
    expect(firstWait).toBeGreaterThan(code)
    expect(configuration).toBeGreaterThan(firstWait)
    expect(secondWait).toBeGreaterThan(configuration)
    expect(at('CreateFunctionUrlConfig', secondWait)).toBeGreaterThan(secondWait)
    expect(log.slice(secondWait).filter(entry => entry === 'AddPermission')).toHaveLength(2)
  })

  it('LMB-12: reports a failed update with its reason', async () => {
    functionExists()
    const updateWait = new Error('waiter failed')
    vi.mocked(waitUntilFunctionUpdatedV2).mockRejectedValueOnce(updateWait)
    answers.GetFunctionConfiguration = () => ({ LastUpdateStatus: 'Failed', LastUpdateStatusReason: 'r' })
    const updateError = await failure()
    expect(updateError.message).toBe('deploy/function-failed: r')
    expect(updateError.cause).toBe(updateWait)

    answers = defaultAnswers()
    const createWait = new Error('waiter failed')
    vi.mocked(waitUntilFunctionActiveV2).mockRejectedValueOnce(createWait)
    answers.GetFunctionConfiguration = () => ({ State: 'Failed', StateReason: 's' })
    const createError = await failure()
    expect(createError.message).toBe('deploy/function-failed: s')
    expect(createError.cause).toBe(createWait)
  })

  it('LMB-13: prints the function URL', async () => {
    await deploy()
    expect(console.info).toHaveBeenCalledWith(`Function URL: ${FUNCTION_URL}`)
  })

  it('LMB-14: uses the given credentials for S3 and Lambda', async () => {
    const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' }
    await deploy({ credentials })
    expect(constructed.map(client => client.service).sort()).toEqual(['lambda', 's3'])
    for (const client of constructed) expect(client.config.credentials).toEqual(credentials)

    constructed.length = 0
    await deploy()
    expect(constructed.map(client => client.service).sort()).toEqual(['lambda', 's3'])
    for (const client of constructed) expect(client.config.credentials).toBeUndefined()
  })

  it('LMB-2: defaults functionName, memory and timeout', async () => {
    await deploy()
    expect(inputsOf(CreateFunctionCommand)[0]).toMatchObject({ FunctionName: 'genoacms', MemorySize: 1024, Timeout: 30 })
  })

  it('LMB-2: sends the given functionName, memory, timeoutSeconds and artifactBucket when creating', async () => {
    const settings = { functionName: 'cms-a_1', memory: 2048, timeoutSeconds: 120, artifactBucket: 'other-artifacts' }
    await deploy(settings)
    const key = '.genoacms/deployment/cms-a_1.zip'
    expect(s3.commandCalls(PutObjectCommand).map(call => call.args[0].input)).toEqual([
      expect.objectContaining({ Bucket: 'other-artifacts', Key: key })
    ])
    expect(inputsOf(GetFunctionCommand)).toEqual([{ FunctionName: 'cms-a_1' }])
    expect(inputsOf(CreateFunctionCommand)).toEqual([expect.objectContaining({
      FunctionName: 'cms-a_1',
      MemorySize: 2048,
      Timeout: 120,
      Code: { S3Bucket: 'other-artifacts', S3Key: key }
    })])
    expect(waitUntilFunctionActiveV2).toHaveBeenCalledWith(expect.anything(), { FunctionName: 'cms-a_1' })
    expect(inputsOf(CreateFunctionUrlConfigCommand).map(input => input.FunctionName)).toEqual(['cms-a_1'])
    expect(inputsOf(AddPermissionCommand).map(input => input.FunctionName)).toEqual(['cms-a_1', 'cms-a_1'])
    expect(inputsOf(GetFunctionUrlConfigCommand)).toEqual([{ FunctionName: 'cms-a_1' }])
  })

  it('LMB-2: sends the given functionName, memory, timeoutSeconds and artifactBucket when updating', async () => {
    functionExists()
    await deploy({ functionName: 'cms-b', memory: 512, timeoutSeconds: 5, artifactBucket: 'other-artifacts' })
    const key = '.genoacms/deployment/cms-b.zip'
    expect(inputsOf(UpdateFunctionCodeCommand)).toEqual([{ FunctionName: 'cms-b', S3Bucket: 'other-artifacts', S3Key: key }])
    expect(inputsOf(UpdateFunctionConfigurationCommand)).toEqual([expect.objectContaining({ FunctionName: 'cms-b', MemorySize: 512, Timeout: 5 })])
    expect(waitUntilFunctionUpdatedV2).toHaveBeenCalledWith(expect.anything(), { FunctionName: 'cms-b' })
  })

  it('LMB-7: uploads the zip of the staged app as the Body', async () => {
    let body = Buffer.alloc(0)
    answers.PutObject = async (input) => {
      body = Buffer.concat(await input.Body.toArray())
      return {}
    }
    await deploy()
    expect(body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    expect(body.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThan(0)
    for (const name of ['run.sh', 'index.js', 'package.json']) expect(body.includes(Buffer.from(name))).toBe(true)
  })

  it('LMB-8: treats a function that GetFunction returns as existing, whatever its state', async () => {
    for (const response of [{}, { Configuration: { State: 'Failed' } }, { Configuration: { State: 'Pending' } }, { Configuration: { State: 'Inactive' } }]) {
      lambda.resetHistory()
      log.length = 0
      answers.GetFunction = () => response
      await deploy()
      expect(log).toContain('UpdateFunctionCode')
      expect(log).not.toContain('CreateFunction')
    }
  })

  it('LMB-9: propagates errors other than ResourceConflictException from the URL and each permission', async () => {
    for (const exists of [false, true]) {
      const urlDenied = awsError('AccessDeniedException')
      answers = defaultAnswers()
      if (exists) functionExists()
      answers.CreateFunctionUrlConfig = () => { throw urlDenied }
      expect(await failure()).toBe(urlDenied)

      for (const statement of ['FunctionURLAllowPublicAccess', 'FunctionURLInvokeAllowPublicAccess']) {
        const denied = awsError('AccessDeniedException')
        answers = defaultAnswers()
        if (exists) functionExists()
        answers.AddPermission = (input) => {
          if (input.StatementId === statement) throw denied
          return {}
        }
        expect(await failure()).toBe(denied)
      }
    }
  })

  it('LMB-11: sends UpdateFunctionCode with exactly FunctionName, S3Bucket and S3Key', async () => {
    functionExists()
    await deploy()
    expect(inputsOf(UpdateFunctionCodeCommand)).toEqual([{ FunctionName: 'genoacms', S3Bucket: 'artifacts', S3Key: ARTIFACT_KEY }])
  })

  it("LMB-12: reports the update's reason when the function also has a state reason", async () => {
    functionExists()
    vi.mocked(waitUntilFunctionUpdatedV2).mockRejectedValueOnce(new Error('waiter failed'))
    answers.GetFunctionConfiguration = () => ({ State: 'Active', StateReason: 's', LastUpdateStatus: 'Failed', LastUpdateStatusReason: 'r' })
    expect((await failure()).message).toBe('deploy/function-failed: r')
  })

  it('LMB-13: prints the URL exactly once, after the create or update', async () => {
    vi.mocked(console.info).mockImplementation(() => { log.push('print') })
    for (const exists of [false, true]) {
      answers = defaultAnswers()
      if (exists) functionExists()
      log.length = 0
      vi.mocked(console.info).mockClear()
      await deploy()
      expect(console.info).toHaveBeenCalledOnce()
      expect(console.info).toHaveBeenCalledWith(`Function URL: ${FUNCTION_URL}`)
      expect(at('print')).toBe(log.length - 1)
      expect(at('print')).toBeGreaterThan(log.lastIndexOf('AddPermission'))
    }
  })

  it("LMB-14: builds the S3 and Lambda clients with the target's region", async () => {
    const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' }
    await deploy({ region: 'us-west-2', credentials })
    expect(constructed.map(client => client.service).sort()).toEqual(['lambda', 's3'])
    for (const client of constructed) expect(client.config).toEqual({ region: 'us-west-2', credentials })

    constructed.length = 0
    await deploy({ region: 'ap-south-1' })
    for (const client of constructed) expect(client.config).toEqual({ region: 'ap-south-1' })
  })
})
