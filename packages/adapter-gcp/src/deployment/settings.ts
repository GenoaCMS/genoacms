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
}

const SETTING_KEYS: readonly string[] = ['runtime', 'memory', 'timeoutSeconds', 'minInstances', 'maxInstances', 'ingress', 'serviceAccount']
const DEFAULT_RUNTIME = 'nodejs22'

/**
 * Cloud Functions v2 `IngressSettings` (ALLOW_ALL, ALLOW_INTERNAL_ONLY, ALLOW_INTERNAL_AND_GCLB), as
 * numbers so that this module, which the descriptor imports, loads no SDK.
 */
const INGRESS: Record<Ingress, number> = { all: 1, internal: 2, 'internal-and-gclb': 3 }

const isInteger = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): boolean =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max

const matches = (value: unknown, pattern: RegExp): boolean => typeof value === 'string' && pattern.test(value)

/** One rule per setting: whether a present value is valid, and the reason when it is not. */
const RULES: Record<string, [(value: unknown) => boolean, string]> = {
  runtime: [value => matches(value, /^nodejs\d+$/), "runtime must be a Node.js runtime such as 'nodejs22'"],
  memory: [value => matches(value, /^\d+(M|Mi|G|Gi)$/), "memory must be a size such as '512Mi' or '1Gi'"],
  timeoutSeconds: [value => isInteger(value, 1, 3600), 'timeoutSeconds must be an integer from 1 to 3600'],
  minInstances: [value => isInteger(value, 0), 'minInstances must be an integer of at least 0'],
  maxInstances: [value => isInteger(value, 1), 'maxInstances must be an integer of at least 1'],
  ingress: [value => typeof value === 'string' && Object.hasOwn(INGRESS, value), "ingress must be 'all', 'internal' or 'internal-and-gclb'"],
  serviceAccount: [value => matches(value, /^[^@\s]+@[^@\s]+$/), 'serviceAccount must be a service account email']
}

function instanceOrder (options: Record<string, unknown>): string[] {
  const { minInstances: min, maxInstances: max } = options
  if (!isInteger(min, 0) || !isInteger(max, 1)) return []
  return (min as number) > (max as number) ? ['minInstances must not exceed maxInstances'] : []
}

/** Reasons the settings in `options` are invalid, else []. Ignores keys that are not settings. */
function validateSettings (options: unknown): string[] {
  const record = typeof options === 'object' && options !== null ? options as Record<string, unknown> : {}
  const reasons = SETTING_KEYS
    .filter(key => record[key] !== undefined && !RULES[key][0](record[key]))
    .map(key => RULES[key][1])
  return [...reasons, ...instanceOrder(record)]
}

/** The Cloud Functions v2 buildConfig for an uploaded source. */
function buildConfig (settings: FunctionSettings, storageSource: object): object {
  return { entryPoint: 'genoacms', runtime: settings.runtime ?? DEFAULT_RUNTIME, source: { storageSource } }
}

/** The Cloud Functions v2 serviceConfig. Unset settings keep the behavior the adapter always had. */
function serviceConfig (settings: FunctionSettings): object {
  return {
    minInstanceCount: settings.minInstances ?? 0,
    maxInstanceCount: settings.maxInstances ?? 1,
    ingressSettings: INGRESS[settings.ingress ?? 'all'],
    environmentVariables: { NODE_ENV: 'production' },
    ...(settings.memory === undefined ? {} : { availableMemory: settings.memory }),
    ...(settings.timeoutSeconds === undefined ? {} : { timeoutSeconds: settings.timeoutSeconds }),
    ...(settings.serviceAccount === undefined ? {} : { serviceAccountEmail: settings.serviceAccount })
  }
}

export { SETTING_KEYS, DEFAULT_RUNTIME, validateSettings, buildConfig, serviceConfig }
export type { Ingress }
