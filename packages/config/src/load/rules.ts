import { SECRET_KEY_PATTERN } from '@genoacms/contracts/secrets'
import type { ConfigIssue } from '../errors.js'
import { isPlainObject, isReference, isSecretRef, isInlineRef } from '../references.js'
import { providerSlots, isWellFormedEntry, type LoadedDescriptor, type ProviderSlot, type WellFormedEntry } from './descriptors.js'

type Mode = 'development' | 'production'

interface RuleContext {
  readonly config: Record<string, unknown>
  readonly descriptors: ReadonlyMap<string, LoadedDescriptor>
  readonly mode: Mode
  readonly forbidInline: boolean
  readonly slots: readonly ProviderSlot[]
}

/** A well-formed provider entry whose descriptor loaded; the only kind rules 3 to 7 and 13 look at. */
interface ResolvedSlot {
  readonly slot: ProviderSlot
  readonly entry: WellFormedEntry
  readonly loaded: LoadedDescriptor
}

const REQUIRED_STANZAS = ['authentication', 'database', 'storage', 'secrets', 'languages', 'authorization', 'security']
const INTEGER_KEY = /^(0|[1-9][0-9]*)$/

const join = (path: string, key: string): string => path === '' ? key : `${path}.${key}`
const issue = (code: string, path: string, message: string): ConfigIssue => ({ code, path, message })

/** Depth-first over objects and arrays. Returning 'skip' from `visit` stops descent below that value. */
function walk (value: unknown, path: string, visit: (value: unknown, path: string) => 'skip' | undefined): void {
  if (visit(value, path) === 'skip') return
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) walk(value[index], `${path}[${index}]`, visit)
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) walk(child, join(path, key), visit)
  }
}

/** Every value in `root` that `matches`, with its path; matched values are not descended into. */
function collect (root: unknown, path: string, matches: (value: unknown) => boolean): Array<{ value: unknown, path: string }> {
  const found: Array<{ value: unknown, path: string }> = []
  walk(root, path, (value, at) => {
    if (!matches(value)) return undefined
    found.push({ value, path: at })
    return 'skip'
  })
  return found
}

function resolvedSlots (ctx: RuleContext): ResolvedSlot[] {
  return ctx.slots.flatMap(slot => {
    if (!isWellFormedEntry(slot.value)) return []
    const loaded = ctx.descriptors.get(slot.value.adapter)
    return loaded === undefined ? [] : [{ slot, entry: slot.value, loaded }]
  })
}

const recordAt = (config: Record<string, unknown>, stanza: string, key: string): Record<string, unknown> | undefined => {
  const parent = config[stanza]
  if (!isPlainObject(parent)) return undefined
  return isPlainObject(parent[key]) ? parent[key] : undefined
}

// Rule 1
const missingStanzas = (ctx: RuleContext): ConfigIssue[] => REQUIRED_STANZAS
  .filter(stanza => !isPlainObject(ctx.config[stanza]))
  .map(stanza => issue('config/missing-stanza', stanza, 'is required and must be an object'))

// Rule 1b
const invalidProviderEntries = (ctx: RuleContext): ConfigIssue[] => ctx.slots
  .filter(slot => !isWellFormedEntry(slot.value))
  .map(slot => issue('config/invalid-provider-entry', slot.path, "must be { adapter: '<descriptor specifier>', options: { … } }"))

// Rule 2
function serializationProblem (value: unknown): string | undefined {
  if (value === undefined) return 'is undefined: remove the key or give it a value'
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : `is ${value}, which JSON cannot represent`
  if (typeof value === 'function') return 'is a function: the config must evaluate to data'
  if (typeof value === 'bigint' || typeof value === 'symbol') return `is a ${typeof value}, which JSON cannot represent`
  if (Array.isArray(value) || isPlainObject(value)) return undefined
  const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'an unknown class'
  return `is an instance of ${name}, which does not survive JSON`
}

const unserializableValues = (ctx: RuleContext): ConfigIssue[] =>
  collect(ctx.config, '', value => serializationProblem(value) !== undefined)
    .map(({ value, path }) => issue('config/not-serializable', path, serializationProblem(value) as string))

// Rule 3
const kindMismatches = (ctx: RuleContext): ConfigIssue[] => resolvedSlots(ctx)
  .filter(({ slot, loaded }) => loaded.descriptor.kind !== slot.kind)
  .map(({ slot, loaded }) => issue('config/kind-mismatch', `${slot.path}.adapter`,
    `${loaded.specifier} is a ${loaded.descriptor.kind} adapter, configured under ${slot.stanza}`))

// Rule 4
function validationReasons ({ entry, loaded }: ResolvedSlot): string[] {
  if (loaded.descriptor.validate === undefined) return []
  try {
    return loaded.descriptor.validate(entry.options)
  } catch (error) {
    return [`validate threw: ${error instanceof Error ? error.message : String(error)}`]
  }
}

const invalidOptions = (ctx: RuleContext): ConfigIssue[] => resolvedSlots(ctx)
  .flatMap(resolved => validationReasons(resolved)
    .map(reason => issue('config/invalid-options', `${resolved.slot.path}.options`, reason)))

// Rule 5
const bareSecrets = (ctx: RuleContext): ConfigIssue[] => resolvedSlots(ctx)
  .flatMap(({ slot, entry, loaded }) => Object.keys(loaded.descriptor.secretOptions ?? {})
    .filter(key => Object.hasOwn(entry.options, key) && !isReference(entry.options[key]))
    .map(key => issue('config/bare-secret', `${slot.path}.options.${key}`,
      'is a credential field: use secret(), env() or inline(), not a bare value')))

// Rule 6
function referencePlaces (ctx: RuleContext): { allowed: Set<string>, skipped: Set<string> } {
  const allowed = new Set<string>()
  const skipped = new Set(ctx.slots.map(slot => slot.path))
  for (const { slot, loaded } of resolvedSlots(ctx)) {
    skipped.delete(slot.path)
    for (const key of Object.keys(loaded.descriptor.secretOptions ?? {})) allowed.add(`${slot.path}.options.${key}`)
  }
  return { allowed, skipped }
}

function misplacedReferences (ctx: RuleContext): ConfigIssue[] {
  const { allowed, skipped } = referencePlaces(ctx)
  const found: ConfigIssue[] = []
  walk(ctx.config, '', (value, path) => {
    if (skipped.has(path)) return 'skip'
    if (!isReference(value)) return undefined
    if (!allowed.has(path)) found.push(issue('config/misplaced-reference', path, 'a secret(), env() or inline() reference is only allowed in a credential field the adapter declares'))
    return 'skip'
  })
  return found
}

// Rule 7
const bootstrapSecrets = (ctx: RuleContext): ConfigIssue[] => resolvedSlots(ctx)
  .filter(({ slot }) => slot.stanza === 'secrets')
  .flatMap(({ slot, entry }) => collect(entry.options, `${slot.path}.options`, isSecretRef))
  .map(({ path }) => issue('config/bootstrap-secret', path,
    'the secrets provider cannot be configured with secret(): nothing exists yet to resolve it; use env() or inline()'))

// Rule 8
const invalidSecretKeys = (ctx: RuleContext): ConfigIssue[] => collect(ctx.config, '', isSecretRef)
  .filter(({ value }) => !SECRET_KEY_PATTERN.test((value as { $secret: string }).$secret))
  .map(({ path }) => issue('config/invalid-secret-key', path, `secret key must match ${SECRET_KEY_PATTERN.source}`))

// Rule 9
function secretsProviderCount (ctx: RuleContext): ConfigIssue[] {
  const providers = recordAt(ctx.config, 'secrets', 'providers')
  if (providers === undefined || Object.keys(providers).length === 1) return []
  return [issue('config/secrets-provider-count', 'secrets.providers',
    `exactly one provider is allowed, found ${Object.keys(providers).length}`)]
}

// Rule 10
function unknownReferences (records: Record<string, unknown> | undefined, recordPath: string, known: Record<string, unknown> | undefined, knownPath: string): ConfigIssue[] {
  if (records === undefined) return []
  return Object.entries(records)
    .filter(([, value]) => !isPlainObject(value) || typeof value.provider !== 'string' || known === undefined || !Object.hasOwn(known, value.provider))
    .map(([key]) => issue('config/unknown-provider', `${recordPath}.${key}.provider`, `must name a key of ${knownPath}`))
}

function unknownProviders (ctx: RuleContext): ConfigIssue[] {
  const targets = recordAt(ctx.config, 'deployment', 'targets')
  const deployment = ctx.config.deployment
  const defaultTarget = isPlainObject(deployment) ? deployment.default : undefined
  const badDefault = defaultTarget !== undefined && (typeof defaultTarget !== 'string' || targets === undefined || !Object.hasOwn(targets, defaultTarget))
  return [
    ...unknownReferences(recordAt(ctx.config, 'storage', 'buckets'), 'storage.buckets', recordAt(ctx.config, 'storage', 'providers'), 'storage.providers'),
    ...unknownReferences(recordAt(ctx.config, 'database', 'databases'), 'database.databases', recordAt(ctx.config, 'database', 'providers'), 'database.providers'),
    ...(badDefault ? [issue('config/unknown-provider', 'deployment.default', 'must name a key of deployment.targets')] : [])
  ]
}

// Rule 11
function unknownDefaultBucket (ctx: RuleContext): ConfigIssue[] {
  const storage = ctx.config.storage
  if (!isPlainObject(storage)) return []
  const buckets = recordAt(ctx.config, 'storage', 'buckets')
  const known = typeof storage.defaultBucket === 'string' && buckets !== undefined && Object.hasOwn(buckets, storage.defaultBucket)
  return known ? [] : [issue('config/unknown-bucket', 'storage.defaultBucket', 'must name a key of storage.buckets')]
}

// Rule 12
function integerKeys (ctx: RuleContext): ConfigIssue[] {
  const keyed = [
    ...ctx.slots.map(slot => ({ key: slot.key, path: slot.path })),
    ...Object.keys(recordAt(ctx.config, 'storage', 'buckets') ?? {}).map(key => ({ key, path: `storage.buckets.${key}` })),
    ...Object.keys(recordAt(ctx.config, 'database', 'databases') ?? {}).map(key => ({ key, path: `database.databases.${key}` }))
  ]
  return keyed
    .filter(({ key }) => INTEGER_KEY.test(key))
    .map(({ path }) => issue('config/integer-key', path,
      'integer-like keys are reordered by JavaScript, which would change the order providers are tried in; use a name'))
}

// Rule 13
const developmentOnlyInProduction = (ctx: RuleContext): ConfigIssue[] => ctx.mode !== 'production'
  ? []
  : resolvedSlots(ctx)
    .filter(({ loaded }) => loaded.descriptor.developmentOnly === true)
    .map(({ slot, loaded }) => issue('config/development-only', `${slot.path}.adapter`,
      `${loaded.specifier} is for development only; a production build cannot use it`))

// Rule 14
function inlineValues (ctx: RuleContext): ConfigIssue[] {
  if (ctx.mode !== 'production') return []
  const code = ctx.forbidInline ? 'config/inline-forbidden' : 'config/inline'
  const { deployment, ...runtimeConfig } = ctx.config
  return collect(runtimeConfig, '', isInlineRef)
    .map(({ path }) => issue(code, path, 'is inline: this value is written into the build'))
}

const RULES: ReadonlyArray<(ctx: RuleContext) => ConfigIssue[]> = [
  missingStanzas,
  invalidProviderEntries,
  unserializableValues,
  kindMismatches,
  invalidOptions,
  bareSecrets,
  misplacedReferences,
  bootstrapSecrets,
  invalidSecretKeys,
  secretsProviderCount,
  unknownProviders,
  unknownDefaultBucket,
  integerKeys,
  developmentOnlyInProduction,
  inlineValues
]

/** Every issue in the config, rules in table order, paths in document order. Pure. */
function checkConfig (config: Record<string, unknown>, descriptors: ReadonlyMap<string, LoadedDescriptor>, mode: Mode, forbidInline: boolean): ConfigIssue[] {
  const ctx: RuleContext = { config, descriptors, mode, forbidInline, slots: providerSlots(config) }
  return RULES.flatMap(rule => rule(ctx))
}

export { checkConfig }
