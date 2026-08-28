import type {
  CompilationResult,
  Diagnostic,
  ExecutablePlatform
} from '@genoacms/internal/languageAdapter'
import type { SourceFile } from 'ts-morph'

import { Project, SyntaxKind } from 'ts-morph'
import { transform } from 'esbuild'

/**
 * Compiling a component's source into something a consumer can run.
 *
 * ## A component brings its own code and nothing else
 *
 * **Every value import is refused.** A component may not pull in another component — nesting is
 * arranged on the page through slot attributes, so no import graph between components exists and
 * cycles are impossible by construction — and it may not pull in a package either.
 *
 * Refusing packages is the part worth justifying, because it costs authors convenience. What the CMS
 * signs is what a visitor's browser executes, with no isolate around it. If compilation resolved
 * `node_modules`, the signature would attest to code the author never wrote and nobody reviewed, and
 * the output would depend on whatever happened to be installed on the machine that compiled it. The
 * artifact would stop being a function of the source.
 *
 * `import type` is allowed. Types are erased before anything is emitted, so a type import puts
 * nothing in the artifact and cannot change what runs.
 *
 * ## The output is a function of the source and the compiler version
 *
 * Nothing here reads the file system or the network. Given the same source, the same
 * `esbuild` produces the same bytes, which is what lets an executable be written once and cached
 * against its commit forever.
 *
 * Upgrading `esbuild` changes the bytes, and therefore the signature, of anything recompiled
 * afterwards. That is fine for a new revision and would be wrong for an old one: published
 * executables are never rebuilt. The configured target has the same property.
 *
 * Nothing here reads configuration. The target arrives as an argument so that compiling stays a
 * function of its inputs, and so these tests can compile for a target without an instance existing.
 */

/** Turns a ts-morph node position into the 1-based line and column an editor shows. */
const locate = (sourceFile: SourceFile, position: number): Pick<Diagnostic, 'line' | 'column'> => {
  const { line, column } = sourceFile.getLineAndColumnAtPos(position)
  return { line, column }
}

const importRefusal = (
  sourceFile: SourceFile,
  position: number,
  specifier: string
): Diagnostic => ({
  type: 'language-rule',
  severity: 'fatal',
  rule: 'import-not-allowed',
  message:
    `This component imports '${specifier}'. A component has to be self-contained: ` +
    'it cannot import another component, and it cannot import a package. Inline what it needs.',
  ...locate(sourceFile, position)
})

/**
 * Every static `import ... from` and `export ... from` that brings in a value.
 *
 * Type-only forms are skipped. `import { type A, B }` is not type-only — `B` is a value — so it is
 * refused, which is correct.
 */
const staticImports = (sourceFile: SourceFile): Diagnostic[] => {
  const declarations = [
    ...sourceFile.getImportDeclarations(),
    ...sourceFile.getExportDeclarations()
  ]
  return declarations
    .filter(declaration => !declaration.isTypeOnly())
    .filter(declaration => declaration.getModuleSpecifier() !== undefined)
    .map(declaration => importRefusal(
      sourceFile,
      declaration.getStart(),
      declaration.getModuleSpecifierValue() ?? ''
    ))
}

/**
 * `import(...)` and `require(...)`.
 *
 * Refused for the same reason as a static import, and separately worth catching: these are the forms
 * that would otherwise reach the network or the file system at run time, after the artifact was
 * signed. The specifier may be computed, so it is reported as written rather than resolved.
 */
const dynamicImports = (sourceFile: SourceFile): Diagnostic[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => {
      const callee = call.getExpression()
      return callee.getKind() === SyntaxKind.ImportKeyword || callee.getText() === 'require'
    })
    .map(call => importRefusal(
      sourceFile,
      call.getStart(),
      call.getArguments()[0]?.getText() ?? '<computed>'
    ))

/** Everything the source is refused for, before it is worth compiling. */
const refusals = (source: string): Diagnostic[] => {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('component.ts', source)
  return [...staticImports(sourceFile), ...dynamicImports(sourceFile)]
}

/** An `esbuild` message, in the shape the rest of the CMS reports problems in. */
const fromEsbuild = (severity: Diagnostic['severity']) =>
  (message: { text: string, location: { line: number, column: number } | null }): Diagnostic => ({
    type: 'language-rule',
    severity,
    rule: 'compilation-failed',
    message: message.text,
    ...(message.location === null
      // esbuild counts columns from zero; a diagnostic counts from one, as an editor does.
      ? {}
      : { line: message.location.line, column: message.location.column + 1 })
  })

/**
 * Strips the types and emits an ES module.
 *
 * There is nothing to link: imports were refused above, so the source is already the whole program
 * and compiling it is a transformation rather than a bundle. `esbuild` is used for the transform
 * itself, which is where the type stripping and the lowering happen.
 */
const toEsModule = async (source: string, target: string): Promise<CompilationResult> => {
  try {
    const { code, warnings } = await transform(source, {
      loader: 'ts',
      format: 'esm',
      target
    })
    return { executableCode: code, diagnostics: warnings.map(fromEsbuild('warning')) }
  } catch (error) {
    const { errors, warnings } = error as { errors?: unknown[], warnings?: unknown[] }
    const messages = [
      ...(errors ?? []).map(fromEsbuild('fatal') as (m: unknown) => Diagnostic),
      ...(warnings ?? []).map(fromEsbuild('warning') as (m: unknown) => Diagnostic)
    ]
    // A thrown error with nothing to report would leave the caller with no reason for the refusal.
    return {
      diagnostics: messages.length > 0
        ? messages
        : [{ type: 'language-rule', severity: 'fatal', rule: 'compilation-failed', message: String(error) }]
    }
  }
}

/**
 * Rejects a platform this adapter does not target.
 *
 * Reported rather than thrown, and reported before compiling: emitting a web module and labeling it
 * something else would publish an artifact no consumer can run.
 */
const unsupportedPlatform = (platform: ExecutablePlatform): Diagnostic => ({
  type: 'language-rule',
  severity: 'fatal',
  rule: 'unsupported-platform',
  message: `The TypeScript adapter compiles for 'web-esmodule', not '${platform}'`
})

/**
 * An empty module is a failure, not a success with nothing in it.
 *
 * A source of only comments compiles cleanly to no code at all. Publishing that would give every
 * page using the component a signed artifact that renders nothing, and the signature would say it
 * was intended.
 */
const emptyOutput = (): Diagnostic => ({
  type: 'language-rule',
  severity: 'fatal',
  rule: 'empty-executable',
  message: 'This component compiles to an empty module. There is nothing for a consumer to run.'
})

const compileToWebEsModule = async (
  source: string,
  platform: ExecutablePlatform,
  target: string
): Promise<CompilationResult> => {
  if (platform !== 'web-esmodule') return { diagnostics: [unsupportedPlatform(platform)] }

  const refused = refusals(source)
  if (refused.length > 0) return { diagnostics: refused }

  const compiled = await toEsModule(source, target)
  if (compiled.executableCode === undefined) return compiled
  if (compiled.executableCode.trim() === '') {
    return { diagnostics: [...compiled.diagnostics, emptyOutput()] }
  }
  return compiled
}

export { compileToWebEsModule }
