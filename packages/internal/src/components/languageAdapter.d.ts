import type { ComponentEntryAttributes } from './attributes'
import type { ComponentExecutable, ExecutablePlatform } from './executable'

/**
 * What a language must provide for components to be authored in it.
 *
 * GenoaCMS reads a component's source to learn what values it accepts, checks that source against
 * safety rules, and compiles it to something a consumer can run. All three are language-specific,
 * and none of them is a cloud service — so they plug in here rather than through
 * `@genoacms/cloudabstraction`.
 *
 * An adapter is registered in `genoa.config` like any other, and a component records which language
 * it is written in, so the CMS resolves the adapter from the component rather than from a global
 * setting.
 *
 * ## A designed extension point, not a validated one
 *
 * **Exactly one implementation exists.** An interface with one implementation has never met a
 * language whose semantics differ, and such interfaces are routinely wrong in ways that surface
 * only when the second one is attempted. Treat this as a design to be tested by the next
 * implementer rather than a settled contract, and expect it to move when it meets a language
 * without structural typing or without a text-based compilation target.
 *
 * Adding a language is a substantial undertaking rather than a shim: an adapter is a complete static
 * analyzer for that language — a parser, the safety ruleset, and a compiler. That is a different
 * order of work from porting the *verifier*, which contains no analysis at all.
 *
 * ## Attributes, not entries
 *
 * `analyze` returns **attributes**. It does not return, and cannot alter, a component's identity,
 * its ordering, or its editing history: those belong to the CMS, and an adapter that received them
 * could change them. The CMS merges what comes back into the entry it already holds, preserving
 * each attribute's uid so that pages referring to it keep working.
 */

/** How much a diagnostic matters. A `fatal` one stops a commit; a `warning` is reported and does not. */
type DiagnosticSeverity = 'fatal' | 'warning'

/**
 * Something the adapter has to say about a source file.
 *
 * **Where** is not optional in practice: a diagnostic an author cannot locate is a refusal without a
 * reason, and the commit it blocks is then a guess. `line` and `column` are 1-based, matching how
 * editors count and how a person reads an error.
 */
interface Diagnostic {
  severity: DiagnosticSeverity
  /** Stable identifier for the rule that produced this, so it can be cited and suppressed. */
  rule: string
  /** What is wrong, in the author's terms. */
  message: string
  line?: number
  column?: number
}

interface AnalysisRequest {
  /** The source as the author wrote it. */
  source: string
  /** The exported function the component is defined by. */
  entryFunction: string
}

interface AnalysisResult {
  /**
   * What the component accepts, keyed by the **parameter name** it was derived from.
   *
   * Not by uid. A uid is identity, the CMS assigns it and preserves it across re-analysis so that
   * pages referring to an attribute keep working — and an adapter has no way to know which stored
   * attribute a parameter corresponds to. Any uid here is fresh and the CMS is free to replace it.
   *
   * Empty when analysis failed.
   */
  attributes: ComponentEntryAttributes
  /** Everything the adapter has to say. A `fatal` entry means `attributes` must not be trusted. */
  diagnostics: Diagnostic[]
}

interface CompilationRequest {
  source: string
  entryFunction: string
  platform: ExecutablePlatform
}

interface CompilationResult {
  /** The bundle, ready to be signed and published. Absent when compilation failed. */
  executableCode?: string
  diagnostics: Diagnostic[]
}

interface LanguageAdapter {
  /** The value a component's `language` field carries to select this adapter. */
  readonly language: string
  /** Platforms this adapter can compile for. */
  readonly platforms: readonly ExecutablePlatform[]

  /**
   * Read a component's source and report what it accepts.
   *
   * Runs at commit time, on a source file, behind a human action. It must not reach the network or
   * the file system: everything it needs is in the request.
   */
  analyze: (request: AnalysisRequest) => Promise<AnalysisResult> | AnalysisResult

  /**
   * Compile the source into a bundle for one platform.
   *
   * Called only after an analysis with no fatal diagnostic. Producing no `executableCode` is a
   * failure and must carry a diagnostic saying why — an empty result with nothing to explain it
   * reads as "nothing to do" and would publish an empty artifact.
   */
  compileBundle: (request: CompilationRequest) => Promise<CompilationResult> | CompilationResult
}

/**
 * How a language adapter is registered in `genoa.config`.
 *
 * The same shape every other adapter uses: a module path, and a dynamic import of that module. The
 * import is a promise because the config file declares it with `import(...)` rather than loading it,
 * so nothing is pulled in until something asks for that language.
 *
 * `Extension` is where an adapter declares its own settings, the way a storage provider declares a
 * region. What those settings are is language-specific — a compilation target means nothing to a
 * language that compiles to bytecode — so they belong to the adapter that reads them and not to this
 * contract.
 */
type LanguageProvider<Extension extends object = object> = Extension & {
  adapterPath: string
  adapter: Promise<{ default: LanguageAdapter }>
}

export type {
  LanguageProvider,
  DiagnosticSeverity,
  Diagnostic,
  AnalysisRequest,
  AnalysisResult,
  CompilationRequest,
  CompilationResult,
  LanguageAdapter,
  ComponentExecutable,
  ExecutablePlatform
}
