import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'
import { host } from '$lib/script/host.server'

/**
 * Finding the adapter for the language a component is written in.
 *
 * A component records its own language, so the adapter is chosen per component rather than by a
 * global setting. That is what makes it possible for one instance to hold components in more than
 * one language at a time.
 *
 * Adapters are declared in `languages.providers`, keyed by language; the host constructs one on first
 * use, so nothing is loaded until a component in that language is analyzed.
 */

/**
 * The adapter for `language`, or an error naming what is configured.
 *
 * An unknown language is a configuration problem, not a component problem: the component says what
 * it is written in, and the instance has not been told how to read that. The error lists the
 * languages that are available so the fix is visible without opening the config file.
 */
const getLanguageAdapter = async (language: string): Promise<LanguageAdapter> => await host.language(language)

export { getLanguageAdapter }
