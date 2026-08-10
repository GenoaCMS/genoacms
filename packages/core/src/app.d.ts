// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { JWTPayload } from 'jose'

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      // set in hooks.server.ts from the verified session cookie; verifyAuthCookie
      // yields false when the cookie is absent
      user?: JWTPayload | false
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
