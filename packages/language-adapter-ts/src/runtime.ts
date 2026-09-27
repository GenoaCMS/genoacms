import { defineRuntime } from '@genoacms/contracts'
import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'
import { createLanguageAdapter } from './index.js'
import { DEFAULT_TARGET } from './target.js'
import type { TypeScriptLanguageOptions } from './descriptor.js'

/** The host's entry point (default export), and the library for tooling (named exports). */
export default defineRuntime<TypeScriptLanguageOptions, LanguageAdapter>({
  create: ({ target }) => createLanguageAdapter(target ?? DEFAULT_TARGET)
})
export { analyze, emitSignature, compileBundle, createLanguageAdapter } from './index.js'
export { DEFAULT_TARGET } from './target.js'
