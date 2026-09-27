import { languageProvider } from '@genoacms/config'
import type {} from '@genoacms/language-adapter-ts'

/**
 * What components may be authored in. Each adapter parses, analyzes and compiles one language;
 * a component records which one it uses, so an instance can hold several at once. Keyed by that
 * language, which is what the adapter reports as its `language`.
 */
export const languages = {
  providers: {
    // What compiled components are lowered to. Defaults to es2020, which every browser with ES
    // module support understands. Raise it for smaller, more modern output at the cost of the
    // browsers below it. Applies to revisions compiled from here on; published ones are never
    // rebuilt, so they keep verifying against the target they were compiled for.
    typescript: languageProvider('@genoacms/language-adapter-ts', { target: 'es2020' })
  }
}
