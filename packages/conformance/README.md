# `@genoacms/conformance`

The suites every GenoaCMS storage and database adapter must pass.

- `runStorageConformance(adapter, { bucket })`
- `runDatabaseConformance(adapter, { collection, testDocuments })`

Each registers a vitest suite when called, so call it at the top level of a test file. They take a
**constructed instance**, not a configuration: an adapter tests exactly what its runtime's `create`
returns.

```js
import { runStorageConformance } from '@genoacms/conformance'
import runtime from '../src/runtime.js'

// Real credentials are opt-in: CI has none, so the suite skips without them.
if (process.env.GENOACMS_TEST_EXAMPLE === '1') {
  const bucket = process.env.GENOACMS_TEST_EXAMPLE_BUCKET
  const adapter = await runtime.create({ /* options */ }, { name: 'conformance', resources: [bucket] })
  runStorageConformance(adapter, { bucket })
}
```

`testDocuments` is a pair: the first is created, the second replaces it in the update case.
