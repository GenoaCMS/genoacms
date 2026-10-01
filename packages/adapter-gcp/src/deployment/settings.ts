type Ingress = 'all' | 'internal' | 'internal-and-gclb'

/** The function's settings, as the gcp target's options name them (architecture GD3). */
export interface FunctionSettings {
  runtime?: string
  memory?: string
  timeoutSeconds?: number
  minInstances?: number
  maxInstances?: number
  ingress?: Ingress
  serviceAccount?: string
  /** Set as ORIGIN: the origin browsers use, when a proxy rewrites the forwarded host (architecture GD5). */
  origin?: string
  /** Set as XFF_DEPTH: which X-Forwarded-For entry, from the right, is the client (architecture GD5). */
  xffDepth?: number
}

const SETTING_KEYS: readonly string[] = ['runtime', 'memory', 'timeoutSeconds', 'minInstances', 'maxInstances', 'ingress', 'serviceAccount', 'origin', 'xffDepth']
const DEFAULT_RUNTIME = 'nodejs22'

// DEP-1, DEP-3
const INGRESS_SETTING_BY_OPTION: Record<Ingress, number> = { all: 1, internal: 2, 'internal-and-gclb': 3 }

const isInteger = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): boolean =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max

const matches = (value: unknown, pattern: RegExp): boolean => typeof value === 'string' && pattern.test(value)

// DEP-4, DEP-14
const RULES: Record<string, [(value: unknown) => boolean, string]> = {
  runtime: [value => matches(value, /^nodejs\d+$/), "runtime must be a Node.js runtime such as 'nodejs22'"],
  memory: [value => matches(value, /^\d+(M|Mi|G|Gi)$/), "memory must be a size such as '512Mi' or '1Gi'"],
  timeoutSeconds: [value => isInteger(value, 1, 3600), 'timeoutSeconds must be an integer from 1 to 3600'],
  minInstances: [value => isInteger(value, 0), 'minInstances must be an integer of at least 0'],
  maxInstances: [value => isInteger(value, 1), 'maxInstances must be an integer of at least 1'],
  ingress: [value => typeof value === 'string' && Object.hasOwn(INGRESS_SETTING_BY_OPTION, value), "ingress must be 'all', 'internal' or 'internal-and-gclb'"],
  serviceAccount: [value => matches(value, /^[^@\s]+@[^@\s]+$/), 'serviceAccount must be a service account email'],
  origin: [value => matches(value, /^https?:\/\/[^/\s]+$/), "origin must be an absolute http(s) origin such as 'https://cms.example.com'"],
  xffDepth: [value => isInteger(value, 1), 'xffDepth must be an integer of at least 1']
}

function instanceOrder (options: Record<string, unknown>): string[] {
  const { minInstances: min, maxInstances: max } = options
  if (!isInteger(min, 0) || !isInteger(max, 1)) return []
  return (min as number) > (max as number) ? ['minInstances must not exceed maxInstances'] : []
}

// DEP-4, DEP-14
function validateSettings (options: unknown): string[] {
  const record = typeof options === 'object' && options !== null ? options as Record<string, unknown> : {}
  const reasons = SETTING_KEYS
    .filter(key => record[key] !== undefined && !RULES[key][0](record[key]))
    .map(key => RULES[key][1])
  return [...reasons, ...instanceOrder(record)]
}

// DEP-3, DEP-10
function buildConfig (settings: FunctionSettings, storageSource: object): object {
  return { entryPoint: 'genoacms', runtime: settings.runtime ?? DEFAULT_RUNTIME, source: { storageSource } }
}

// DEP-10, DEP-14, GQ1, GD8
function environmentVariables (settings: FunctionSettings): Record<string, string> {
  return {
    NODE_ENV: 'production',
    IGNORED_ROUTES: '',
    ...(settings.origin === undefined ? {} : { ORIGIN: settings.origin }),
    ...(settings.xffDepth === undefined ? {} : { XFF_DEPTH: String(settings.xffDepth) })
  }
}

// DEP-3, DEP-10, GD3
function serviceConfig (settings: FunctionSettings): object {
  return {
    minInstanceCount: settings.minInstances ?? 0,
    maxInstanceCount: settings.maxInstances ?? 1,
    ingressSettings: INGRESS_SETTING_BY_OPTION[settings.ingress ?? 'all'],
    environmentVariables: environmentVariables(settings),
    ...(settings.memory === undefined ? {} : { availableMemory: settings.memory }),
    ...(settings.timeoutSeconds === undefined ? {} : { timeoutSeconds: settings.timeoutSeconds }),
    ...(settings.serviceAccount === undefined ? {} : { serviceAccountEmail: settings.serviceAccount })
  }
}

export { SETTING_KEYS, DEFAULT_RUNTIME, validateSettings, buildConfig, serviceConfig }
export type { Ingress }
