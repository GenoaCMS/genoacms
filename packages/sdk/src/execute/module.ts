/**
 * Turning verified `executableCode` into a live ES module.
 *
 * ## Nothing here decides whether the code is trustworthy
 *
 * By the time anything in this file runs, the artifact has been verified and its pin and platform
 * checked. This module is the step *after* that decision, and it makes none of its own — which is
 * why it is a separate entry point from `./verify`. A consumer that only wants a verdict never loads
 * it, and a second-language implementer mirrors the verifier without owning any of this.
 *
 * ## How a module is loaded, and why it depends on the host
 *
 * `import()` needs a URL, and the two ways to give it one are not equally available:
 *
 * - A **blob URL** is what a browser wants. It is a same-origin URL, so it survives a Content
 *   Security Policy that forbids inline script, provided `script-src` permits `blob:`.
 * - A **data URL** is what Node accepts, because `import()` of a `blob:` URL is not implemented
 *   there. Browsers largely refuse `data:` in `script-src`, so it is not a browser fallback — it is
 *   the other host's only route.
 *
 * The consumer chooses where each step runs, so neither choice is imposed: `loadModule` is
 * an option, and a consumer with a stricter policy, a worker, or a sandboxed iframe supplies its
 * own.
 */

/** A module's exports, as `import()` yields them. */
type ModuleNamespace = Record<string, unknown>

/** How source text becomes a module. Replaceable — see the note on hosts above. */
type ModuleLoader = (code: string) => Promise<ModuleNamespace>

/**
 * Loaded, or the reason it could not be.
 *
 * Discriminated rather than thrown, for the reason a verdict is: one component failing to evaluate
 * is a fact about that node, and a renderer has to be able to report it without the whole page
 * becoming an exception.
 */
type Loaded<T> =
  | { ok: true, value: T }
  | { ok: false, reason: string }

/**
 * Whether this host imports blob URLs.
 *
 * Tested by looking for a window rather than for `URL.createObjectURL`, which Node also provides
 * while refusing to import what it returns. The question is which host this is, so that is what is
 * asked.
 */
const importsBlobURLs = (): boolean =>
  typeof globalThis.window !== 'undefined' && typeof URL.createObjectURL === 'function'

const fromBlobURL: ModuleLoader = async (code) => {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  try {
    return await import(/* @vite-ignore */ url) as ModuleNamespace
  } finally {
    // Released whether or not the module evaluated. The import has already read it, and leaving it
    // behind pins the source in memory for the lifetime of the document.
    URL.revokeObjectURL(url)
  }
}

const fromDataURL: ModuleLoader = async (code) => {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(code)))
  return await import(/* @vite-ignore */ `data:text/javascript;base64,${encoded}`) as ModuleNamespace
}

/** The loader this host can actually use. */
const defaultLoader: ModuleLoader = async (code) =>
  await (importsBlobURLs() ? fromBlobURL : fromDataURL)(code)

/**
 * Evaluates verified source as a module.
 *
 * A module that throws while evaluating is reported, not raised. Verified code is still code that
 * can be wrong, and an author's mistake in one component is not grounds for failing the request.
 */
const loadModule = async (
  code: string,
  loader: ModuleLoader = defaultLoader
): Promise<Loaded<ModuleNamespace>> => {
  try {
    return { ok: true, value: await loader(code) }
  } catch (error) {
    return { ok: false, reason: `module-evaluation-failed: ${String(error)}` }
  }
}

/**
 * The component function a module is supposed to export.
 *
 * **A component's entry is the default export**, always, whatever the component is called. It used to
 * be an export named after the component, and this looked one up by name — a rule that made a
 * component's name its identifier too, so a component called `my-hero` could be authored and never
 * published. The CMS now emits the whole declaration around an author's body, under a fixed internal
 * name, and a name is free text again.
 *
 * Nothing is looked up by the component's name here as a result, which also removes a way for the
 * page and the artifact to disagree: a node naming one component could not reach into a bundle built
 * for another and find something callable.
 */
const entryFunction = (namespace: ModuleNamespace): Loaded<(...args: never[]) => unknown> => {
  const exported = namespace.default
  if (exported === undefined) {
    return {
      ok: false,
      reason: 'executable-missing-export: the bundle has no default export'
    }
  }
  if (typeof exported !== 'function') {
    return {
      ok: false,
      reason: `executable-export-not-a-function: the default export is ${typeof exported}`
    }
  }
  return { ok: true, value: exported as (...args: never[]) => unknown }
}

export { loadModule, entryFunction, defaultLoader }
export type { ModuleLoader, ModuleNamespace, Loaded }
