/**
 * Refuses to deploy a payload containing the instance's service account.
 *
 * ## Why this exists
 *
 * The demos read a **private** bucket, so each `packages/demo-<framework>/.env` holds a service-account
 * key -- and `artifactProxy()` calls `loadEnv(mode, root, '')`, the empty prefix, which deliberately
 * reads *every* variable including that one. That call runs during `vite build`, not only
 * `vite dev`. So the secret is in the build process's memory each time a demo is built, and the only
 * thing keeping it out of the bundle is that Vite inlines `import.meta.env.VITE_*` and nothing else.
 *
 * That is true today. It is a property of a bundler's behavior rather than of anything this
 * repository controls, and one `define`, one stray `JSON.stringify(env)`, or one plugin that decides
 * to be helpful would end it silently. A leaked key is not recoverable by editing a file afterwards:
 * it is published, and the answer is to rotate it.
 *
 * So the check runs as a `predeploy` hook in `firebase.json`, against the bytes that are about to be
 * uploaded, and a non-zero exit stops the deploy.
 *
 * ## What it looks for
 *
 * Not the *word* `private_key` -- a bundler that renamed or re-encoded the value would sail past
 * that. It takes the actual credential out of the `.env` files and searches for the secret itself,
 * in each form a bundle could plausibly carry it.
 *
 * ## The self-test is not optional
 *
 * A needle search that has never fired is a search nobody has checked: a typo in a needle looks
 * exactly like a clean result. Before scanning anything, this plants the credential in every
 * encoding and requires every needle to fire. Writing this check the obvious way produced a needle
 * that *could not* match -- cut from the whitespace-stripped key, so blind to a bundle that kept the
 * newlines -- and the self-test is what caught it. It runs on every invocation, and a needle that
 * fails to fire fails the deploy just as a leak would.
 *
 * Usage: `node leakcheck.mjs <dir> [dir...]`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DEMOS = resolve(import.meta.dirname, '..')

/** Never worth reading, and enormous. */
const SKIP = new Set(['node_modules', '.git', '.firebase'])

/**
 * The forms a private key could take in a built artifact, each needing its own needle.
 *
 * One needle is not enough: a slice of the whitespace-stripped key cannot match a bundle that kept
 * the newlines, and would report "absent" against a bundle that had leaked the key in full.
 */
const ENCODINGS = {
  'raw, newlines intact': (c) => c.private_key ?? '',
  'JSON-escaped newlines': (c) => JSON.stringify(c),
  'whitespace stripped': (c) => (c.private_key ?? '').replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, ''),
  'base64 of the whole credential': (c) => Buffer.from(JSON.stringify(c)).toString('base64')
}

/** `GENOACMS_CREDENTIALS` out of a dotenv file, unwrapping quotes the way dotenv does. */
const credentialFrom = (path) => {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }

  const line = text.split('\n').find(l => l.startsWith('GENOACMS_CREDENTIALS='))
  if (line === undefined) return undefined

  let value = line.slice('GENOACMS_CREDENTIALS='.length).trim()
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1)
  }

  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** Every credential this checkout could have built a demo with. */
const credentials = () => {
  const found = []
  for (const entry of readdirSync(DEMOS)) {
    if (!entry.startsWith('demo-')) continue
    const credential = credentialFrom(join(DEMOS, entry, '.env'))
    if (credential !== undefined) found.push({ source: `${entry}/.env`, credential })
  }
  return found
}

/**
 * A distinctive slice from the middle of each encoding, plus the identifying fields.
 *
 * From the middle rather than the start, because the first line of a PEM body is identical across
 * keys of the same size -- a needle matching it would prove very little.
 */
const needles = (credential) => {
  const middle = (text, width = 64) =>
    text.slice(Math.floor(text.length / 2), Math.floor(text.length / 2) + width)

  const found = Object.entries(ENCODINGS)
    .map(([label, encode]) => [`private key -- ${label}`, middle(encode(credential))])

  found.push(['client_email', credential.client_email])
  found.push(['private_key_id', credential.private_key_id])

  return found.filter(([, value]) => typeof value === 'string' && value.length > 8)
}

/** Proves each needle can fire before any of them is trusted to say "absent". */
const selfTest = (credential) => {
  const planted = Object.values(ENCODINGS).map(encode => encode(credential)).join('\n')
  return needles(credential)
    .filter(([, needle]) => !planted.includes(needle))
    .map(([label]) => label)
}

const filesUnder = (dir) => {
  const found = []
  const walk = (at) => {
    for (const entry of readdirSync(at)) {
      if (SKIP.has(entry)) continue
      const path = join(at, entry)
      if (statSync(path).isDirectory()) walk(path)
      else found.push(path)
    }
  }
  walk(dir)
  return found
}

const scan = (paths, all) => {
  const hits = []
  for (const path of paths) {
    const contents = readFileSync(path, 'latin1')
    for (const { source, credential } of all) {
      for (const [label, needle] of needles(credential)) {
        if (contents.includes(needle)) hits.push({ path, source, label })
      }
    }
  }
  return hits
}

const directories = process.argv.slice(2)
if (directories.length === 0) {
  console.error('leakcheck: usage: node leakcheck.mjs <dir> [dir...]')
  process.exit(2)
}

const all = credentials()

if (all.length === 0) {
  // Not a pass. Without a credential to search for, this proves nothing -- and the usual reason is
  // a CI checkout with no .env, exactly where a silent "clean" would be most misleading.
  console.error('leakcheck: no GENOACMS_CREDENTIALS found in any packages/demo-*/.env.')
  console.error('leakcheck: nothing to search for, so this is not a pass. Refusing to vouch for the payload.')
  process.exit(2)
}

for (const { source, credential } of all) {
  const dead = selfTest(credential)
  if (dead.length > 0) {
    console.error(`leakcheck: SELF-TEST FAILED for ${source}. These needles cannot match anything:`)
    for (const label of dead) console.error(`  - ${label}`)
    console.error('leakcheck: a needle that cannot fire would report a leak as clean. Refusing to run.')
    process.exit(2)
  }
}

const paths = directories.flatMap(dir => filesUnder(resolve(dir)))
const hits = scan(paths, all)

if (hits.length > 0) {
  console.error('')
  console.error('leakcheck: *** THE PAYLOAD CONTAINS A SERVICE ACCOUNT. DEPLOY BLOCKED. ***')
  console.error('')
  for (const { path, source, label } of hits) {
    console.error(`  ${path}`)
    console.error(`    ${label}, from ${source}`)
  }
  console.error('')
  console.error('leakcheck: this key must be treated as compromised if it has ever been uploaded.')
  console.error('leakcheck: rotate it rather than only fixing the build.')
  process.exit(1)
}

const scanned = directories.map(d => d.replace(/\/$/, '').split('/').pop()).join(', ')
console.log(
  `leakcheck: ${paths.length} files in ${scanned} clean of ${all.length} credential(s); ` +
  `${needles(all[0].credential).length} needles, all self-tested.`
)
