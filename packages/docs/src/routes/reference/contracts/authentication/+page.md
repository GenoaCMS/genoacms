---
title: Authentication types
---

Authentication answers *"who are you?"*. It is a genuinely delegable question, so it remains a
cloud abstraction service with pluggable adapters.

An adapter returns an `Identity` rather than a boolean, because the rest of GenoaCMS needs a stable
subject to attach permissions to.

## Identity

```ts
interface Identity {
  subject: string
  email: string
}
```

`subject` is a stable, immutable, provider-issued identifier and is the **only** value that may
participate in an authorization decision. `email` is display metadata — email addresses are mutable
and reassignable, so a recycled corporate address would otherwise silently inherit the permissions
of its previous holder.

## Adapter

```ts
interface Adapter {
  authenticate: (email: string, password: string) => Promise<Identity | null>
}

export default Adapter
```

`authenticate` resolves to `null` for invalid credentials. Rejecting is reserved for a provider
that could not answer at all — an unreachable identity platform, for instance — so that a failed
login is not indistinguishable from an outage.

## Module

```ts
import type Adapter from './adapter.d'

declare module '@genoacms/adapter-*/authentication' {
  import type Adapter from './adapter.d'

  const authenticate: Adapter.authenticate

  export {
    authenticate
  }
}

type AuthenticationProvider<Extension extends object = object> = Extension & {
  name: string
  adapter: Promise<typeof Adapter>
}

export type {
  Adapter,
  AuthenticationProvider,
  Identity
}
```
