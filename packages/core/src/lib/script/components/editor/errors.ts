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
