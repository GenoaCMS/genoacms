---
'@genoacms/core': minor
'@genoacms/sdk': minor
---

The key registry becomes a key manifest, `genoacms.keyRegistry.v2`: it lists each key with the
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
