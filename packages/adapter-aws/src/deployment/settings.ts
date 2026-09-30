export interface FunctionSettings {
  functionName?: string
  memory?: number
  timeoutSeconds?: number
  origin?: string
}

export const SETTING_KEYS = ['functionName', 'memory', 'timeoutSeconds', 'origin'] as const

export const DEFAULT_FUNCTION_NAME = 'genoacms'
export const DEFAULT_MEMORY = 1024
export const DEFAULT_TIMEOUT_SECONDS = 30

const ROLE_ARN = /^arn:aws[a-z-]*:iam::\d{12}:role\/.+$/
const FUNCTION_NAME = /^[A-Za-z0-9_-]{1,64}$/
const ORIGIN = /^https?:\/\/[^/\s]+$/

const isIntegerIn = (value: unknown, min: number, max: number): boolean =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max

const matches = (value: unknown, pattern: RegExp): boolean => typeof value === 'string' && pattern.test(value)

interface Rule { key: string, applies: (value: unknown) => boolean, valid: (value: unknown) => boolean, reason: string }

const isGiven = (value: unknown): boolean => value !== undefined
// AWS-3
const isNonEmptyString = (value: unknown): boolean => typeof value === 'string' && value !== ''

// LMB-3
const RULES: Rule[] = [
  { key: 'role', applies: isNonEmptyString, valid: value => matches(value, ROLE_ARN), reason: 'role must be an IAM role ARN' },
  { key: 'functionName', applies: isGiven, valid: value => matches(value, FUNCTION_NAME), reason: "functionName must be 1 to 64 letters, digits, '-' or '_'" },
  { key: 'memory', applies: isGiven, valid: value => isIntegerIn(value, 128, 10240), reason: 'memory must be an integer from 128 to 10240' },
  { key: 'timeoutSeconds', applies: isGiven, valid: value => isIntegerIn(value, 1, 900), reason: 'timeoutSeconds must be an integer from 1 to 900' },
  { key: 'origin', applies: isGiven, valid: value => matches(value, ORIGIN), reason: "origin must be an absolute http(s) origin such as 'https://cms.example.com'" }
]

const asRecord = (options: unknown): Record<string, unknown> =>
  typeof options === 'object' && options !== null ? options as Record<string, unknown> : {}

// LMB-3
export function validateSettings (options: unknown): string[] {
  const record = asRecord(options)
  return RULES
    .filter(rule => rule.applies(record[rule.key]) && !rule.valid(record[rule.key]))
    .map(rule => rule.reason)
}

// LMB-10
export function functionEnvironment (options: { origin?: string }): Record<string, string> {
  const origin: Record<string, string> = options.origin === undefined
    ? { PROTOCOL_HEADER: 'x-forwarded-proto', HOST_HEADER: 'host' }
    : { ORIGIN: options.origin }
  return {
    NODE_ENV: 'production',
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
    PORT: '8080',
    ADDRESS_HEADER: 'x-forwarded-for',
    XFF_DEPTH: '1',
    ...origin
  }
}
