import { randomBytes } from 'node:crypto'
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  waitUntilTableExists,
  waitUntilTableNotExists
} from '@aws-sdk/client-dynamodb'
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

export const enabled = process.env.GENOACMS_TEST_AWS === '1'
export const region = process.env.GENOACMS_TEST_AWS_REGION ?? ''
export const bucket = process.env.GENOACMS_TEST_AWS_BUCKET ?? ''
export const lambdaRole = process.env.GENOACMS_TEST_AWS_LAMBDA_ROLE ?? ''

export const runId = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
export const objectPrefix = `genoacms-contract/${runId}/`
export const functionName = `genoacms-contract-${runId}`
export const secretKey = (name: string): string => `genoacms-contract/${runId}/${name}`
export const tableName = `genoacms-contract-${runId}`

const TABLE_WAIT_SECONDS = 300

export async function createRunTable (): Promise<void> {
  const client = new DynamoDBClient({ region })
  await client.send(new CreateTableCommand({
    TableName: tableName,
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST'
  }))
  await waitUntilTableExists({ client, maxWaitTime: TABLE_WAIT_SECONDS }, { TableName: tableName })
}

export async function deleteRunTable (): Promise<void> {
  const client = new DynamoDBClient({ region })
  await client.send(new DeleteTableCommand({ TableName: tableName }))
  await waitUntilTableNotExists({ client, maxWaitTime: TABLE_WAIT_SECONDS }, { TableName: tableName })
}

export async function deleteRunObjects (): Promise<void> {
  const client = new S3Client({ region })
  let ContinuationToken: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: objectPrefix, ContinuationToken }))
    const Objects = (page.Contents ?? []).map(({ Key }) => ({ Key }))
    if (Objects.length > 0) {
      const { Errors } = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects, Quiet: true } }))
      if (Errors !== undefined && Errors.length > 0) throw new Error(`cleanup failed: ${Errors.map(error => `${error.Key}: ${error.Code}`).join(', ')}`)
    }
    ContinuationToken = page.NextContinuationToken
  } while (ContinuationToken !== undefined)
}
