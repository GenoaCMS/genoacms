import { defineLanguageAdapter } from '@genoacms/contracts'

export interface TypeScriptLanguageOptions {
  /**
   * What the emitted module is lowered to — `es2020`, `es2022`, `chrome109`, and so on. Default es2020.
   *
   * Configurable because the answer depends on who visits the site this instance publishes, which
   * is not something the adapter can know. Raising it emits smaller, more modern code and drops the
   * browsers below it.
   *
   * **Changing this changes the bytes of anything compiled afterwards, and therefore its
   * signature.** Published executables are never rebuilt, so a change applies to new revisions and
   * leaves existing ones verifying against the target they were compiled for.
   *
   * @see https://esbuild.github.io/api/#target for what a target may be.
   */
  target?: string
}

declare module '@genoacms/contracts' {
  interface LanguageAdapters { '@genoacms/language-adapter-ts': TypeScriptLanguageOptions }
}

function validate (options: unknown): string[] {
  const o = (typeof options === 'object' && options !== null ? options : {}) as Record<string, unknown>
  const reasons = Object.keys(o).filter(key => key !== 'target').map(key => `unknown option '${key}'`)
  if (o.target !== undefined && (typeof o.target !== 'string' || o.target === '')) reasons.push('target must be a non-empty string')
  return reasons
}

/** SDK-free: importing this loads neither ts-morph nor esbuild. */
export default defineLanguageAdapter<TypeScriptLanguageOptions>({
  runtime: '@genoacms/language-adapter-ts/runtime',
  validate
})
