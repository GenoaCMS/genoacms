import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isIP } from 'node:net'
import { LambdaClient, DeleteFunctionCommand, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import procedure from '../../src/deployment/procedure.js'
import { enabled, region, bucket, lambdaRole, functionName } from './aws.js'

const TEN_MINUTES = 10 * 60 * 1000
const URL_PROPAGATION_MS = 60_000
const FORGED_CLIENT = '203.0.113.9'
const CLIENT_ADDRESS = 'x-genoacms-client-address'
const REQUEST_CONTEXT = 'x-amzn-request-context'
const FORGED_HEADERS = {
  'X-Forwarded-For': FORGED_CLIENT,
  [CLIENT_ADDRESS]: FORGED_CLIENT,
  [REQUEST_CONTEXT]: JSON.stringify({ http: { sourceIp: FORGED_CLIENT } })
}
const FUNCTION_URL_LINE = /^Function URL: (https:\/\/\S+)$/
const artifactDir = fileURLToPath(new URL('./artifact', import.meta.url))
const roots: string[] = []

let lambda: LambdaClient
let functionUrl = ''

interface Echo {
  env: Record<string, string>
  headers: Record<string, string>
}

function deployContext () {
  const root = mkdtempSync(join(tmpdir(), 'genoa-aws-contract-'))
  roots.push(root)
  const buildDir = join(root, 'build')
  const workDir = join(root, 'work')
  cpSync(artifactDir, buildDir, { recursive: true })
  mkdirSync(workDir)
  return { projectRoot: root, buildDir, workDir, target: 'aws' }
}

async function deployPrintingUrl (options: Record<string, unknown>): Promise<string> {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  try {
    await procedure({ region, role: lambdaRole, artifactBucket: bucket, functionName, ...options } as never, deployContext())
    const printed = info.mock.calls.map(call => String(call[0])).find(line => FUNCTION_URL_LINE.test(line))
    expect(printed).toMatch(FUNCTION_URL_LINE)
    return (printed as string).replace(FUNCTION_URL_LINE, '$1')
  } finally {
    info.mockRestore()
  }
}

async function anonymousGet (url: string): Promise<Echo> {
  const request = async (): Promise<Response> => await fetch(url, { headers: FORGED_HEADERS })
  await expect.poll(async () => (await request()).status, { timeout: URL_PROPAGATION_MS, interval: 2000 }).toBe(200)
  const response = await request()
  expect(response.status).toBe(200)
  return await response.json() as Echo
}

async function deleteIfPresent (): Promise<void> {
  try {
    await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }))
  } catch (error) {
    if ((error as { name?: string }).name !== 'ResourceNotFoundException') throw error
  }
  await new S3Client({ region }).send(new DeleteObjectCommand({ Bucket: bucket, Key: `.genoacms/deployment/${functionName}.zip` }))
}

describe.runIf(enabled)('Lambda deploy, against the real service', { timeout: TEN_MINUTES, sequential: true }, () => {
  beforeAll(() => {
    lambda = new LambdaClient({ region })
  })

  afterAll(async () => {
    await deleteIfPresent()
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  }, TEN_MINUTES)

  it('LMB-7, LMB-8, LMB-9, LMB-10, LMB-13, LMB-14, LMB-15: creates a public function with the web adapter, and prints its URL', async () => {
    functionUrl = await deployPrintingUrl({})
    const echo = await anonymousGet(functionUrl)
    expect(echo.env).toEqual({
      NODE_ENV: 'production',
      PORT: '8080',
      ADDRESS_HEADER: CLIENT_ADDRESS,
      PROTOCOL_HEADER: 'x-forwarded-proto',
      HOST_HEADER: 'host'
    })
    expect(echo.headers.host).toBe(new URL(functionUrl).host)
    expect(echo.headers['x-forwarded-proto']).toBe('https')
    const sourceIp = JSON.parse(echo.headers[REQUEST_CONTEXT]).http.sourceIp
    expect(echo.headers[CLIENT_ADDRESS]).toBe(sourceIp)
    expect(isIP(echo.headers[CLIENT_ADDRESS])).not.toBe(0)
    expect(echo.headers[CLIENT_ADDRESS]).not.toBe(FORGED_CLIENT)
  })

  it('LMB-11: updates code and configuration', async () => {
    await deployPrintingUrl({ memory: 512, origin: 'https://cms.example' })
    const configuration = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }))
    expect(configuration.MemorySize).toBe(512)
    const echo = await anonymousGet(functionUrl)
    expect(echo.env.ORIGIN).toBe('https://cms.example')
    expect(echo.env).not.toHaveProperty('PROTOCOL_HEADER')
  })
})
