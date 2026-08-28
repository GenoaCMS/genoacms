import type { AttributeReference, ComponentHeaderAttributes } from './attributes'
import type { ExecutablePlatform } from './executable'
import type { SastRuleId } from './sast'

/**
 * What a language must provide for components to be authored in it.
 *
 * An author writes a component's **body**. Everything around it — the entry function, its
 * parameters, their types and their order — is emitted from the component's header, which is
 * authored in the registrar. Assembling that, checking the result against safety rules, and
 * compiling it to something a consumer can run are all language-specific, and none of them is a
 * cloud service, so they plug in here rather than through `@genoacms/cloudabstraction`.
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
 * Adding a language is a substantial undertaking rather than a shim: an adapter emits that
 * language's syntax for a component's parameters, applies the safety ruleset to what results, and
 * compiles it. That is a different order of work from porting the *verifier*, which contains no
 * analysis at all.
 *
 * ## The adapter is given a body and a shape, never assembled source
 *
 * Both `analyze` and `compileBundle` take the author's body together with the component's shape, and
 * assemble internally. The CMS never sees the assembled source and never computes a position in it.
 *
 * That matters for **diagnostics**. An adapter emits a prologue of its own choosing, so a fault the
 * author can see on line 3 of their body is somewhere else entirely in what was compiled. The
 * adapter is the only thing that knows the difference, so it maps positions back before returning —
 * and drops anything falling inside its own prologue, which is code the author did not write and
 * cannot fix.
 *
 * ## The adapter does not learn what a component accepts — it is told
 *
 * An earlier contract had `analyze` **derive** a component's attributes by reading its source. That
 * is gone. A component's shape is authored in the registrar, identically for a component whose code
 * lives in the consuming application and one written here, so there is nothing left to discover: an
 * adapter that reported attributes would be reporting back what it had just been handed.
 *
 * What went with it is worth stating, because it was a live hazard rather than merely redundant
 * work. Re-derivation produced fresh attributes on every publication, which had to be rematched to
 * the stored ones **by parameter name** to preserve each attribute's uid — and a page node holds
 * that uid, so a match that failed detached every page using the attribute, silently.
 */

/** How much a diagnostic matters. A `fatal` one stops a commit; a `warning` is reported and does not. */
type DiagnosticSeverity = 'fatal' | 'warning'

/** What was violated. Both kinds come from the adapter — the security ruleset is its work too. */
type DiagnosticType = 'language-rule' | 'security-rule'

/** Everything a diagnostic carries regardless of which kind of rule produced it. */
interface DiagnosticBase {
  severity: DiagnosticSeverity
  /** What is wrong, in the author's terms. */
  message: string
  line?: number
  column?: number
}

/**
 * A rule of the language itself: a name that cannot become a parameter, two that collide, an import
 * the assembly will not accept, a compile that failed.
 *
 * Its `rule` is an **open string**, because these identifiers belong to the adapter that emitted
 * them. A Kotlin adapter fails in ways a TypeScript one has no name for, and a shared contract
 * enumerating TypeScript's failure modes would either bloat or block it.
 */
interface LanguageRuleDiagnostic extends DiagnosticBase {
  type: 'language-rule'
  rule: string
}

/**
 * A violation of the SAST ruleset.
 *
 * Its `rule` is a **closed union**, because the ruleset is GenoaCMS's rather than any adapter's:
 * every adapter implements the same rules, reports the same identifiers, and is measured against
 * them. That is what lets a coverage report compare two adapters at all.
 */
interface SecurityRuleDiagnostic extends DiagnosticBase {
  type: 'security-rule'
  rule: SastRuleId
}

/**
 * Something the adapter has to say about a source file.
 *
 * **Where** is not optional in practice: a diagnostic an author cannot locate is a refusal without a
 * reason, and the commit it blocks is then a guess. `line` and `column` are 1-based, matching how
 * editors count and how a person reads an error.
 *
 * ## Why the two kinds are separated
 *
 * They were one field with an open string, and that made a compiler crash indistinguishable from a
 * rule that fired. **Coverage is reported as rules rejected over rules attempted**, so a run where the
 * compiler failed six times would have counted six rejections and reported a ruleset working better
 * than it was. Discriminating on `type` makes that miscount unrepresentable rather than merely
 * unlikely.
 *
 * Both kinds are produced by the language adapter — the SAST analysis lives there, since detecting a
 * violation means walking that language's AST. What differs is who owns the *identifier*.
 */
type Diagnostic = LanguageRuleDiagnostic | SecurityRuleDiagnostic

/**
 * A component's parameters, in the order a consumer calls them.
 *
 * **Ordered, and the order is the contract.** A consumer calls a component positionally, so an
 * adapter that emitted these in any other order would produce a component that runs and is wrong —
 * every value landing in the wrong parameter, with nothing failing to say so.
 */
interface ComponentShape {
  attributes: ComponentHeaderAttributes
  attributeOrder: AttributeReference[]
}

/** What the author wrote, and what it is to be wrapped in. */
interface SourceRequest {
  /** The **body** of the entry function, as the author wrote it. Not a whole module. */
  body: string
  shape: ComponentShape
}

type AnalysisRequest = SourceRequest

interface AnalysisResult {
  /**
   * Everything the adapter has to say, in the **author's** coordinates.
   *
   * A `fatal` entry stops a publication. An empty array means the adapter found nothing to say —
   * which is what the TypeScript adapter returns today, because the safety ruleset that will fill
   * this in arrives later, and the seam exists so that it has somewhere to land.
   */
  diagnostics: Diagnostic[]
}

interface CompilationRequest extends SourceRequest {
  platform: ExecutablePlatform
}

/**
 * The signature a body is wrapped in, written out so an author can read it.
 *
 * The editor shows a body and nothing else, so without this an author writes against parameters
 * that nothing on screen names — they would have to infer the parameter list from the registrar and
 * guess how each attribute's name was turned into an identifier.
 *
 * It comes from the adapter and not from the CMS for the same reason assembly does: the syntax, the
 * type each attribute becomes and the name each one is given are facts about the target language. A
 * preview the CMS composed would be a second implementation of the emitter, free to drift from the
 * one that actually compiles — exactly the class of defect emitting the signature exists to remove.
 */
interface SignaturePreview {
  /** The declaration, without the body. Display only: nothing is compiled from it. */
  text: string
  /** What stops this shape being emitted — a name that cannot become a parameter, or two that collide. */
  diagnostics: Diagnostic[]
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
   * Check what the author wrote against the language's safety rules.
   *
   * Runs when a component is published, behind a human action. It must not reach the network or the
   * file system: everything it needs is in the request.
   */
  analyze: (request: AnalysisRequest) => Promise<AnalysisResult> | AnalysisResult

  /**
   * Write out the signature a body will be wrapped in, for the author to read.
   *
   * Display only. It must produce exactly what `analyze` and `compileBundle` assemble around, or it
   * is a lie an author writes code against.
   */
  emitSignature: (shape: ComponentShape) => Promise<SignaturePreview> | SignaturePreview

  /**
   * Assemble the body into an entry function and compile it into a bundle for one platform.
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
  ComponentShape,
  SignaturePreview,
  SourceRequest,
  LanguageProvider,
  DiagnosticSeverity,
  DiagnosticType,
  DiagnosticBase,
  LanguageRuleDiagnostic,
  SecurityRuleDiagnostic,
  Diagnostic,
  AnalysisRequest,
  AnalysisResult,
  CompilationRequest,
  CompilationResult,
  LanguageAdapter,
  ExecutablePlatform
}
