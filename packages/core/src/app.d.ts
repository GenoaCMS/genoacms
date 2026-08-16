// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { JWTPayload } from 'jose'
import type { AuthContext } from '$lib/script/authorization/context'

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      // set in hooks.server.ts from the verified session cookie; verifyAuthCookie
      // yields false when the cookie is absent
      user?: JWTPayload | false
      /**
       * Resolved authorization context, present when the request carries a valid session for a
       * principal this instance knows. Absent means unauthenticated or unknown — never "allowed".
       */
      auth?: AuthContext
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
