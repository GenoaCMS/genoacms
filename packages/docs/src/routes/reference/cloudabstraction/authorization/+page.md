---
title: Authorization types
---

## Adapter

```ts
interface Adapter {
  isEmailAdmins: (email: string) => Promise<boolean>
}

export default Adapter
```

## Module

```ts
import type Adapter from './adapter.d'

declare module '@genoacms/adapter-*/authorization' {
  import type Adapter from './adapter.d'

  const isEmailAdmins: Adapter.isEmailAdmins

  export {
    isEmailAdmins
  }
}

type AuthorizationProvider<Extension extends object = object> = Extension & {
  name: string
  adapter: Promise<typeof Adapter>
}

export type {
  Adapter,
  AuthorizationProvider
}
```
