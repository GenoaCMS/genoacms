import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'
import { config } from '@genoacms/cloudabstraction'

/**
 * Finding the adapter for the language a component is written in.
 *
 * A component records its own language, so the adapter is chosen per component rather than by a
 * global setting. That is what makes it possible for one instance to hold components in more than
 * one language at a time.
 *
 * Adapters are declared in `genoa.config` as a path and a dynamic import, like every other adapter.
 * Nothing is loaded until a component in that language is analyzed.
 */

/** Adapters already loaded, so a second component in the same language does not re-import it. */
const loaded = new Map<string, LanguageAdapter>()

const loadAdapters = async (): Promise<LanguageAdapter[]> => {
  const providers = config.languages?.providers ?? []
  const modules = await Promise.all(providers.map(async provider => await provider.adapter))
  return modules.map(module => module.default)
}

/**
 * The adapter for `language`, or an error naming what is configured.
 *
 * An unknown language is a configuration problem, not a component problem: the component says what
 * it is written in, and the instance has not been told how to read that. The error lists the
 * languages that are available so the fix is visible without opening the config file.
 */
const getLanguageAdapter = async (language: string): Promise<LanguageAdapter> => {
  const cached = loaded.get(language)
  if (cached) return cached

  const adapters = await loadAdapters()
  for (const adapter of adapters) loaded.set(adapter.language, adapter)

  const adapter = loaded.get(language)
  if (!adapter) {
    const available = adapters.map(candidate => candidate.language)
    throw new Error(
      `No language adapter is configured for '${language}'. ` +
      (available.length > 0
        ? `Configured languages: ${available.join(', ')}.`
        : 'No language adapters are configured at all.')
    )
  }
  return adapter
}

export { getLanguageAdapter }
