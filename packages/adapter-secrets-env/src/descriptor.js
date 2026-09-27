import { defineSecretsAdapter } from '@genoacms/contracts'

const ALLOWED = new Set(['path'])

/**
  * Secrets in a plaintext file under the project, for development only.
  *
  * `developmentOnly` makes a production build refuse this adapter, so a development config deployed
  * by mistake fails at build time rather than on a read-only serverless filesystem.
  */
export default defineSecretsAdapter({
    runtime: '@genoacms/adapter-secrets-env/runtime',
    developmentOnly: true,
    validate (options) {
        const reasons = []
        for (const key of Object.keys(options ?? {})) {
            if (!ALLOWED.has(key)) reasons.push(`unknown option '${key}'`)
        }
        const { path } = /** @type {{ path?: unknown }} */ (options ?? {})
        if (path !== undefined && (typeof path !== 'string' || path === '')) reasons.push('path must be a non-empty string')
        return reasons
    }
})
