/**
 * Raised when a reference names nothing the editor can open.
 *
 * A named error rather than a bare `Error`, because the routes have to tell it apart from a genuine
 * failure. Opening a component that does not exist — a deleted one, a stale bookmark, a mistyped
 * uid — is an ordinary **404**, while a bare `Error` reaching a `load` is a 500: the CMS reporting
 * its own fault for something the caller got wrong.
 *
 * It covers a reference that names a *prebuilt* component too. That component exists, but not to the
 * editor: it has no source and no definition, so there is nothing here to show and the honest answer
 * is the same one.
 */
class NoSuchComponentError extends Error {
  constructor (readonly reference: string, message: string) {
    super(message)
    this.name = 'NoSuchComponentError'
  }
}

/**
 * Raised when there is nothing to record, or the wrong thing.
 *
 * Three codes, one per refusal: `no-change` from a commit whose code matches the last one and from a
 * publication whose code and shape both match the last one, and `uncommitted-draft` from a
 * publication attempted over an unsaved edit. All three are things an author did rather than faults,
 * so the routes report the message and leave the editor as it was.
 */
class ComponentDiffError extends Error {
  constructor (public code: string, message: string) {
    super(message)
  }
}
class ComponentCodeError extends Error {
  constructor (public code: string, message: string) {
    super(message)
  }
}

export {
  NoSuchComponentError,
  ComponentDiffError,
  ComponentCodeError
}
