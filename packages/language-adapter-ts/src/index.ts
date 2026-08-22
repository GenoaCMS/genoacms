import type {
  AnalysisRequest,
  AnalysisResult,
  CompilationRequest,
  CompilationResult,
  LanguageAdapter
} from '@genoacms/internal/languageAdapter'
import { deriveAttributes } from './attributes.js'

/**
 * The TypeScript language adapter.
 *
 * The reference implementation of `LanguageAdapter`, and currently the only one. Registered in
 * `genoa.config`, and selected by the language a component records rather than by a global setting.
 */

const analyse = (request: AnalysisRequest): AnalysisResult => {
  const { attributes, diagnostics } = deriveAttributes(request.source, request.entryFunction)
  return { attributes, diagnostics }
}

/**
 * Not implemented yet.
 *
 * Declared so the contract is satisfied and the shape of a failure is exercised from the start:
 * producing no `executableCode` is a failure, and a failure must carry a diagnostic saying why. An
 * empty result with nothing to explain it reads as "nothing to do" and would publish an empty
 * artifact.
 */
const compileBundle = (request: CompilationRequest): CompilationResult => ({
  diagnostics: [{
    severity: 'fatal',
    rule: 'compilation-unavailable',
    message: `Compiling for '${request.platform}' is not implemented yet`
  }]
})

const adapter: LanguageAdapter = {
  language: 'typescript',
  platforms: ['web-esmodule'],
  analyse,
  compileBundle
}

export default adapter
export { adapter, analyse, compileBundle }
