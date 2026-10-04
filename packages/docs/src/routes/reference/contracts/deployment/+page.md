---
title: Deployment types
---

## Adapter

```ts
interface Adapter {
  svelteKitAdapter: string
  deployProcedure: () => Promise<void>
}

export default Adapter
```

## Module

```ts
declare module '@genoacms/adaoter-*/deployment' {
  import type Adapter from './adapter.d'

  const deployProcedure: Adapter.deployProcedure

  export {
    deployProcedure
  }
}

export type {
  Adapter
} from './adapter.d'

```
