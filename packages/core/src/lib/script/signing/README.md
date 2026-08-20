# Signing

The chain of trust: a root anchor, subordinate operational keys, and the signed documents that
carry them. Everything GenoaCMS stores about who may do what is signed here.

The shape follows one idea. **A consumer embeds a single 32-byte root public key and fetches a
single document.** Everything else it will ever trust follows from those two things, which is what
lets keys beneath the root rotate without redeploying anything.

---

## Two tiers, and why

| | Algorithm | Signs | Rotation cost |
| :--- | :--- | :--- | :--- |
| **Root** | SLH-DSA-SHA2-128s | the key registry, the security policy | **high** — every consumer must be rebuilt |
| **Subordinate** | ML-DSA-65 | the authorization manifests, later component artifacts | zero — publish a new registry |

The root is the only layer whose compromise cannot be repaired cheaply, so it takes the
conservative hash-based scheme and signs as little as possible. Its ~1.2 s signing time and 7.8 KB
signature do not matter for two documents written rarely. Subordinates sign everything else, where
3.3 KB and millisecond signing do matter.

**The security policy is root-signed** even though it is not part of the key material, because it
*governs* the subordinate keys — it says when they rotate, and will say what ceilings constrain the
code they sign. A subordinate signing it could rewrite the rule that retires it.

---

## Files

### Primitives — pure, no I/O, no configuration

| File | Responsibility |
| :--- | :--- |
| **`algorithms.ts`** | The named-algorithm registry. **The only file that imports the crypto library**, which is what keeps the algorithm a value in the data rather than a constant in the code — and bounds the upgrade cost of a pre-1.0 dependency. `verify` never throws; malformed input from a bucket must read as "does not verify", not crash a request. |
| **`canonical.ts`** | RFC 8785 canonicalization and the SHA-256 digest that is signed. Rejects anything JSON cannot represent rather than normalising it — an `undefined` member is silently dropped by canonicalization, which would attest to a payload the caller never supplied. |
| **`envelope.ts`** | `{ alg, keyId, type, payload, signature }`, and the rule that the signature covers **all four**, not the payload alone. Closes algorithm confusion, key substitution and document substitution. |
| **`keyId.ts`** | `keyId = SHA-256(publicKey)[0..16]`. Derived, never assigned, so a different key is necessarily a different id and a rotation cannot reuse an identifier. |
| **`secretNames.ts`** | Where keys live in the secrets service. Pure, so the naming rules are testable without a provider. |
| **`registry.ts`** | The registry as a value: parsing, validation, rotation and revocation. Every rule here is one an attacker would like relaxed. |
| **`keyResolver.ts`** | The registry cache and its invalidation policy. Takes its loader as a constructor parameter, so the policy is testable without a bucket — which matters, because the assertions are about *how many times storage was read*. |

### Server — storage, secrets, orchestration

| File | Responsibility |
| :--- | :--- |
| **`rootKey.server.ts`** | Loads the root, generating it on first boot behind an **atomic claim** so concurrent instances cannot each mint an anchor. Stores only the 48-byte seed. |
| **`subordinateKey.server.ts`** | Creates, loads and forgets subordinate keys. One secret per key, named by `keyId`, so rotation is additive and never a read-modify-write. |
| **`registry.server.ts`** | Reads, verifies and publishes `.genoacms/keys/public.json`. Bootstraps with `ifAbsent`, rotates with `ifVersion`. |
| **`registrySequence.server.ts`** | The rollback high-water mark, held in the **secrets service** — outside the bucket, which is the entire mechanism. |
| **`keyResolution.server.ts`** | What the rest of the CMS calls: a `keyId` in, a verification key out; a signing key for whatever is current. Also where a due rotation is triggered. |
| **`signedDocument.server.ts`** | The read-verify core, shared. Two paths: one resolves through the registry, one terminates at the anchor — which is what makes the chain finite. |
| **`rootRotation.server.ts`** | Replaces the anchor. Reached only through `npm run rotate-root`, which refuses without explicit confirmation. |

`../securityPolicy/` holds the signed policy document that this module reads for the rotation
interval. It lives outside `signing/` because it is not about keys — guard ceilings and the fetch
origin allowlist join it as those are built.

---

## Verification, end to end

```
document from the bucket
  └─ peekUnverifiedHeader()      keyId, for lookup only — named for what it is
  └─ resolve the key
       ├─ root-signed documents  -> the trust anchor directly        (registry, policy)
       └─ everything else        -> keyResolver -> registry lookup   (manifests)
  └─ verify()                    signature over { alg, keyId, type, payload }
  └─ parse                       schema validation
```

The header is read before anything is established, because a verifier needs the `keyId` to fetch
the key it will verify against. That is safe only because `verify` re-reads those fields from the
envelope and binds them into the digest: a lie told in the header makes the signature fail rather
than take effect.

---

## Rules that are easy to break by accident

**`undefined` is not a verification result.** `resolveVerificationKey` returns `undefined` for a key
that is unknown *or revoked*. A caller treating that as success accepts every forgery.

**Verdict is not outage.** A bad signature, an unknown key and a revoked key are conclusions about a
document. Storage or the registry being unreachable is not, and must propagate — a caller that
replaces a document on a transient failure destroys data it merely could not read.

**Superseded is not revoked.** A superseded key still verifies, which is what makes routine rotation
safe and what makes it useless against a leak. Revocation is all-or-nothing, because nothing dates a
signature and the key under suspicion would attest any timestamp we added.

**The cache refreshes on an unrecognised `keyId`.** That is not an optimisation: an unknown key is
exactly what the first signature after a rotation elsewhere looks like, and suppressing that lookup
rejects artifacts that are perfectly good.

---

## Not here yet

| | Lands with |
| :--- | :--- |
| `ComponentEntry` signing | the attribute representation it serialises |
| `ComponentExecutable` signing | the compilation pipeline that produces one |
| The client-side verifier and its conformance corpus | the portability specification |
| Ed25519 as a classical control | the cryptographic cost study |

---

## Testing

Security-critical guards here are **mutation-tested**: break the guard, confirm the suite fails,
restore. The envelope binding, the revocation check, the registry's self-consistency rule, the
rollback sequence and the cache policy each have a recorded mutation that fails them.

SLH-DSA signing costs about a second, so tests that need real signatures share fixtures across
their assertions rather than repeating them — a file that sits near the default timeout fails
intermittently rather than usefully.
