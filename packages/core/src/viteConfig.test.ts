import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import config from '../vite.config'

/**
 * A regression guard for a defect the end-to-end suites structurally cannot see.
 *
 * The development secrets adapter keeps its secrets in `.env` and **writes** to it at runtime —
 * minting a key seed, advancing the registry sequence. Vite watches the env files and restarts the
 * dev server when one changes, so every such write killed the request that made it: rotating a
 * signing key reported failure while the server appeared to crash, and revoking one published the
 * revocation and *then* died, reporting a failure that had not happened.
 *
 * `tests/keys.spec.ts` runs against `build && preview`, which watches nothing, so it passed
 * throughout. The invariant therefore has to be asserted where the cause is — in the configuration —
 * rather than through the interface.
 *
 * It lives under `src/` because vitest's default `exclude` drops `**\/vite.config.*`, which a file
 * named after what it tests would have matched.
 */

describe('the dev server and the secret store', () => {
  it('does not treat the secrets file as configuration', () => {
    // `envDir: false` is what stops the restart: Vite's condition is
    // `envDir !== false && getEnvFilesForMode(mode, envDir).includes(file)`.
    expect(config.envDir).toBe(false)
  })

  it('is only safe to do because nothing here reads a Vite env variable', () => {
    // The guard above would be wrong rather than merely redundant if the project used one, so the
    // premise is checked instead of remembered. `.env` holds secrets the adapter loads into
    // `process.env` itself, and nothing Vite needs to see.
    const path = new URL('../.env', import.meta.url)
    if (!existsSync(path)) return

    expect(readFileSync(path, 'utf-8')).not.toMatch(/^VITE_/m)
  })
})
