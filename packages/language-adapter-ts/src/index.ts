import type {
  AnalysisRequest,
  AnalysisResult,
  CompilationRequest,
  CompilationResult,
  ComponentShape,
  Diagnostic,
  SignaturePreview
} from '@genoacms/internal/languageAdapter'
import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'
import { assemble, signatureOf } from './emit.js'
import { compileToWebEsModule } from './compile.js'
import { scanSource } from './sast/scan.js'
import { target } from './config.js'

/**
 * The TypeScript language adapter.
 *
 * The reference implementation of `LanguageAdapter`, and currently the only one. Registered in
 * `genoa.config`, and selected by the language a component records rather than by a global setting.
 *
 * This module is where configuration meets the things that do the work. `emit.ts` and `compile.ts`
 * take everything they need as arguments and read no configuration of their own, so both can be
 * exercised without an instance existing.
 *
 * ## Assembly happens here, twice, and never leaves
 *
 * Both entry points are given the author's **body** and the component's shape, and each assembles
 * the entry function itself. Assembling is pure and cheap, so doing it twice costs nothing worth
 * saving — and the alternative, handing assembled source back to the CMS to pass along, would put
 * TypeScript the CMS cannot read into the CMS, and positions in it that only this package can
 * interpret.
 */

/**
 * Moves a diagnostic from the assembled source into the author's body.
 *
 * The author is looking at a body; the compiler saw a body with a signature above it. Reporting the
 * compiler's line number would point at a line the author never wrote, and for a short body at one
 * that does not exist at all.
 *
 * A diagnostic **inside the prologue is dropped**, not clamped to line 1. The prologue is emitted
 * code: a fault in it is this adapter's to fix, and showing it to an author as though they had
 * written it would be asking them to correct something they cannot see. Dropping it is a deliberate
 * silence rather than an oversight — if the emitter can produce an invalid signature, that is a bug
 * here and belongs in this package's own tests.
 */
const intoBodyCoordinates = (diagnostic: Diagnostic, prologueLines: number): Diagnostic | undefined => {
  if (diagnostic.line === undefined) return diagnostic
  if (diagnostic.line <= prologueLines) return undefined
  return { ...diagnostic, line: diagnostic.line - prologueLines }
}

const reported = (diagnostics: Diagnostic[], prologueLines: number): Diagnostic[] =>
  diagnostics
    .map(diagnostic => intoBodyCoordinates(diagnostic, prologueLines))
    .filter((diagnostic): diagnostic is Diagnostic => diagnostic !== undefined)

/**
 * Checks what the author wrote against the language's safety rules.
 *
 * Two kinds of answer, and the order between them matters. **Emitting the signature comes first**:
 * a shape that cannot become a parameter list has no assembled source worth scanning, and scanning
 * it anyway would report security rules about a signature the author never wrote.
 *
 * With a signature that emits, the security ruleset runs over the assembled source and its findings
 * are mapped back into the author's coordinates — the author is looking at a body, and a line number
 * counted from the top of the assembly would point at a line they cannot see.
 *
 * It does not report what a component *accepts*. That used to be its purpose, and it is gone: a
 * component's shape is authored in the registrar, so an adapter reporting attributes would be
 * handing back what it was just given.
 */
const analyze = (request: AnalysisRequest): AnalysisResult => {
  const { source, prologueLines, diagnostics } = assemble(request.body, request.shape)
  if (diagnostics.some(diagnostic => diagnostic.severity === 'fatal')) return { diagnostics }

  return { diagnostics: [...diagnostics, ...reported(scanSource(source), prologueLines)] }
}

/**
 * The signature, for the editor to show above the body.
 *
 * The same function `assemble` builds from, so the preview cannot drift from what compiles.
 */
const emitSignature = (shape: ComponentShape): SignaturePreview => signatureOf(shape)

const compileBundle = async (request: CompilationRequest): Promise<CompilationResult> => {
  const { source, prologueLines, diagnostics } = assemble(request.body, request.shape)
  // A shape that cannot be emitted has no source worth compiling, and compiling it would report
  // syntax errors about a signature the author did not write.
  if (diagnostics.some(diagnostic => diagnostic.severity === 'fatal')) return { diagnostics }

  const compiled = await compileToWebEsModule(source, request.platform, target)
  return {
    ...compiled,
    diagnostics: [...diagnostics, ...reported(compiled.diagnostics, prologueLines)]
  }
}

const adapter: LanguageAdapter = {
  language: 'typescript',
  platforms: ['web-esmodule'],
  analyze,
  emitSignature,
  compileBundle
}

export default adapter
export { adapter, analyze, emitSignature, compileBundle }
export { DEFAULT_TARGET } from './config.js'
