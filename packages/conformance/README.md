# `@genoacms/conformance`

The suites every GenoaCMS storage, database and authentication adapter must pass.

- `runStorageConformance(adapter, { bucket })`
- `runDatabaseConformance(adapter, { collection, testDocuments })`
- `runAuthenticationConformance(adapter, { identity, disabled? }, { runs? })`

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

The storage suite checks the storage contract: names and directories, the bucket check, reads and
versions, conditional writes, moves, deletes, the not-found error, one-level and paged listings, and
directory deletes and moves. It writes only under a directory `genoacms-conformance-<random>/` of the
bucket, and deletes it afterwards, also after a failed test. A bucket named
`<bucket>-unregistered` stands for one the provider was not given, so the adapter must not be given
it. Signed and public URLs are not fetched; test them against the real service.
