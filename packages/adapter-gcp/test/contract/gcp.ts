import { randomBytes } from 'node:crypto'

export const enabled = process.env.GENOACMS_TEST_GCP === '1'
export const projectId = process.env.GENOACMS_TEST_GCP_PROJECT ?? ''
export const bucket = process.env.GENOACMS_TEST_GCP_BUCKET ?? ''
export const region = process.env.GENOACMS_TEST_GCP_REGION ?? ''

export const runId = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
export const objectPrefix = `genoacms-contract/${runId}/`
export const functionName = `genoacms-contract-${runId}`
export const secretKey = (name: string): string => `GENOACMS_CONTRACT_${runId}_${name}`

export const GRPC_NOT_FOUND = 5
