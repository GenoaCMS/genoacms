import type {
  AnalysisRequest,
  AnalysisResult,
  CompilationRequest,
  CompilationResult,
  LanguageAdapter
} from '@genoacms/internal/languageAdapter'
import { deriveAttributes } from './attributes.js'
import { compileToWebEsModule } from './compile.js'
import { target } from './config.js'

/**
 * The TypeScript language adapter.
 *
 * The reference implementation of `LanguageAdapter`, and currently the only one. Registered in
 * `genoa.config`, and selected by the language a component records rather than by a global setting.
 *
 * This module is where configuration meets the two things that do the work. `attributes.ts` and
 * `compile.ts` take everything they need as arguments and read no configuration of their own, so
 * both can be exercised without an instance existing.
 */

const analyze = (request: AnalysisRequest): AnalysisResult => {
  const { attributes, diagnostics } = deriveAttributes(request.source, request.entryFunction)
  return { attributes, diagnostics }
}

const compileBundle = async (request: CompilationRequest): Promise<CompilationResult> =>
  await compileToWebEsModule(request.source, request.platform, target)

const adapter: LanguageAdapter = {
  language: 'typescript',
  platforms: ['web-esmodule'],
  analyze,
  compileBundle
}

export default adapter
export { adapter, analyze, compileBundle }
export { DEFAULT_TARGET } from './config.js'
export type { TypeScriptLanguageSettings, TypeScriptLanguageProvider } from './config.js'
