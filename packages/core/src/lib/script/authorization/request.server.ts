import { error } from '@sveltejs/kit'
import type { AuthContext } from './context'

/**
 * The authorization context for a request, or a 401.
 *
 * Service functions take an `AuthContext` rather than reading one from ambient state, so every
 * route has to produce one. This is that one place: `locals.auth` is optional because a request may
 * be anonymous, and a route that needs authority says so here instead of each one inventing its own
 * check — or worse, reaching for a non-null assertion and turning "not signed in" into a crash.
 *
 * Absent means unauthenticated or a principal this instance does not know. Neither is "allowed".
 */
function requireAuthContext (locals: App.Locals): AuthContext {
  const context = locals.auth
  if (context === undefined) error(401, 'unauthenticated')
  return context
}

export {
  requireAuthContext
}
