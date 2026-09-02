import type { LanguageProvider } from '@genoacms/internal/languageAdapter'
import { getProvider } from '@genoacms/cloudabstraction'
import { DEFAULT_TARGET } from './target.js'

/**
 * What this adapter reads from its entry in `genoa.config`.
 *
 * Registered the way every other adapter is, and read the same way: `getProvider` returns this
 * adapter's own entry, and the settings on it are this adapter's to interpret.
 */

const ADAPTER_PATH = '@genoacms/language-adapter-ts'

/**
 * Settings this adapter accepts.
 *
 * @see https://esbuild.github.io/api/#target for what a target may be.
 */
interface TypeScriptLanguageSettings {
  /**
   * What the emitted module is lowered to — `es2020`, `es2022`, `chrome109`, and so on.
   *
   * Configurable because the answer depends on who visits the site this instance publishes, which
   * is not something the adapter can know. Raising it emits smaller, more modern code and drops the
   * browsers below it.
   *
   * **Changing this changes the bytes of anything compiled afterwards, and therefore its
   * signature.** Published executables are never rebuilt, so a change applies to new revisions and
   * leaves existing ones verifying against the target they were compiled for.
   */
  target?: string
}

type TypeScriptLanguageProvider = LanguageProvider<TypeScriptLanguageSettings>

const provider = getProvider('languages', ADAPTER_PATH) as TypeScriptLanguageProvider

const target = provider.target ?? DEFAULT_TARGET

export { target, DEFAULT_TARGET, ADAPTER_PATH }
export type { TypeScriptLanguageSettings, TypeScriptLanguageProvider }
