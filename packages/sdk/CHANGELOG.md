# @genoacms/sdk

## 0.2.0

### Minor Changes

- [`0d2fa49`](https://github.com/GenoaCMS/genoacms/commit/0d2fa496a5890a3227ef8852180ed075286710dd) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The key registry becomes a key manifest, `genoacms.keyRegistry.v2`: it lists each key with the
  SHA-256 of its public key, and each public key moves to a file of its own at
  `.genoacms/keys/public/<keyId>.json`, fetched only by a verifier that needs it. An envelope whose
  algorithm differs from the one its key was registered for is refused before its signature is checked.

  `@genoacms/core` no longer reads a `genoacms.keyRegistry.v1` registry: it refuses one with
  `registry/needs-migration`. Rotating writes the new key's file; revoking deletes the revoked key's
  file.

  `@genoacms/sdk` no longer reads a `genoacms.keyRegistry.v1` registry either. `verifyEnvelope` takes
  `{ alg, publicKey }` in place of a public key, `resolveKey` is removed, and `readKeyFile` and
  `keyFilePath` are added. `new Verifier({ …, minimumRegistrySequence })` takes the instance's secret
  mark and refuses a manifest below it.

### Patch Changes

- [`8acedc6`](https://github.com/GenoaCMS/genoacms/commit/8acedc65e678f2eec80980a025889f787d761157) Thanks [@Hejtmus](https://github.com/Hejtmus)! - `resolvePage` requests every publication a page pins at once instead of one node at a time, and the
  verifier loads the key registry while the first document is still downloading, sharing one load
  among concurrent verifications. Results are unchanged: a page with several faults still reports the
  first in depth-first page order.
