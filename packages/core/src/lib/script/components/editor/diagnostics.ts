import type { Diagnostic } from '@genoacms/internal/languageAdapter'
import { ComponentCodeError } from './errors'

/**
 * Turning an adapter's diagnostics into the refusal the CMS acts on.
 *
 * An adapter **reports** rather than throws, because reporting lets it describe several problems in
 * one pass — an author fixing one import at a time re-commits once per import. The CMS commits or it
 * does not, so at this boundary the first fatal is the one that matters.
 *
 * The rule becomes the error code, so a caller can still tell `missing-entry-function` from
 * `import-not-allowed` without parsing a message written for a person.
 */

/** The first thing that makes a result unusable, if anything does. */
const fatalOf = (diagnostics: Diagnostic[]): Diagnostic | undefined =>
  diagnostics.find(diagnostic => diagnostic.severity === 'fatal')

/**
 * Locates a diagnostic in the source, for a message an author can act on.
 *
 * A refusal an author cannot place is a refusal without a reason, and the commit it blocks becomes a
 * guess. `line` and `column` are absent for problems that are about the file as a whole, such as a
 * missing entry function, so the suffix is omitted rather than rendered as `undefined`.
 */
const at = (diagnostic: Diagnostic): string => {
  if (diagnostic.line === undefined) return ''
  return diagnostic.column === undefined
    ? ` (line ${diagnostic.line})`
    : ` (line ${diagnostic.line}, column ${diagnostic.column})`
}

/** Raises the first fatal diagnostic, if there is one. Warnings do not stop a commit. */
const raiseFatal = (diagnostics: Diagnostic[]): void => {
  const fatal = fatalOf(diagnostics)
  if (fatal === undefined) return
  throw new ComponentCodeError(fatal.rule, `${fatal.message}${at(fatal)}`)
}

export {
  fatalOf,
  raiseFatal
}
