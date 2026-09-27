import { describe, it, expect, vi, beforeEach } from 'vitest'
import procedure from './procedure.js'

const { sent, functionExists, recordingClient, command } = vi.hoisted(() => {
  const sent = []
  const functionExists = { value: false }
  const recordingClient = (service) => vi.fn(function (config) {
    this.config = config
    this.send = vi.fn(async (command) => {
      sent.push(`${service}:${command.type}`)
      if (command.type === 'GetFunction' && !functionExists.value) throw new Error('not found')
      if (command.type === 'GetFunctionUrlConfig') return { FunctionArn: 'arn:lambda' }
      if (command.type === 'CreateRestApi') return { id: 'api' }
      if (command.type === 'GetResources') return { items: [{ id: 'root' }] }
      if (command.type === 'CreateResource') return { id: 'resource' }
      return {}
    })
  })
  const command = (type) => vi.fn(function (input) { this.type = type; this.input = input })
  return { sent, functionExists, recordingClient, command }
})

vi.mock('@aws-sdk/client-s3', () => ({ S3Client: recordingClient('s3'), PutObjectCommand: command('PutObject') }))
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: recordingClient('lambda'),
  CreateFunctionCommand: command('CreateFunction'),
  GetFunctionCommand: command('GetFunction'),
  UpdateFunctionCodeCommand: command('UpdateFunctionCode'),
  AddPermissionCommand: command('AddPermission'),
  GetFunctionUrlConfigCommand: command('GetFunctionUrlConfig')
}))
vi.mock('@aws-sdk/client-api-gateway', () => ({
  APIGatewayClient: recordingClient('apigateway'),
  GetRestApiCommand: command('GetRestApi'),
  CreateRestApiCommand: command('CreateRestApi'),
  GetResourcesCommand: command('GetResources'),
  CreateResourceCommand: command('CreateResource'),
  PutMethodCommand: command('PutMethod'),
  PutIntegrationCommand: command('PutIntegration'),
  CreateDeploymentCommand: command('CreateDeployment')
}))
vi.mock('./stage.js', () => ({
  stageLambdaApp: vi.fn(async (_buildDir, app) => app),
  zipDirectory: vi.fn(async (_dir, out) => out),
  installProductionDependencies: vi.fn()
}))
vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal()), createReadStream: vi.fn(() => 'archive-stream') }))

const { PutObjectCommand } = await import('@aws-sdk/client-s3')
const { CreateFunctionCommand } = await import('@aws-sdk/client-lambda')

const options = { region: 'eu-central-1', role: 'arn:role', accountId: '123', artifactBucket: 'artifacts' }
const ctx = { projectRoot: '/p', buildDir: '/p/.genoacms/build', workDir: '/p/.genoacms/deploy/aws', target: 'aws' }

beforeEach(() => {
  sent.length = 0
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('the AWS deploy procedure', () => {
  it('uploads to the artifact bucket, then creates the function and its API when it does not exist', async () => {
    functionExists.value = false
    await procedure(options, ctx)
    expect(vi.mocked(PutObjectCommand).mock.lastCall[0]).toMatchObject({ Bucket: 'artifacts', Key: '.genoacms/deployment/build.zip' })
    expect(vi.mocked(CreateFunctionCommand).mock.lastCall[0]).toMatchObject({ FunctionName: 'genoacms', Role: 'arn:role', Code: { S3Bucket: 'artifacts', S3Key: '.genoacms/deployment/build.zip' } })
    expect(sent).toContain('apigateway:CreateDeployment')
    expect(sent).toContain('lambda:AddPermission')
  })

  it('only updates the code of a function that exists', async () => {
    functionExists.value = true
    await procedure({ ...options, functionName: 'cms' }, ctx)
    expect(sent.filter(s => s.startsWith('lambda:'))).toEqual(['lambda:GetFunction', 'lambda:UpdateFunctionCode'])
    expect(sent.some(s => s.startsWith('apigateway:'))).toBe(false)
  })
})
