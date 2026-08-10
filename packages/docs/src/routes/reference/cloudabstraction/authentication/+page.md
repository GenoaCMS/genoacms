---
title: Authentication types
---

## Adapter

```ts
interface Adapter {
  loginWithEmailAndPassword: (email: string, password: string) => Promise<boolean>
}

export default Adapter
```

## Module

```ts
import type Adapter from './adapter.d'

declare module '@genoacms/adapter-*/authentication' {
  import type Adapter from './adapter.d'

  const loginWithEmailAndPassword: Adapter.loginWithEmailAndPassword

  export {
    loginWithEmailAndPassword
  }
}

type AuthenticationProvider<Extension extends object = object> = Extension & {
  name: string
  adapter: Promise<typeof Adapter>
}

export type {
  Adapter,
  AuthenticationProvider
}
```
