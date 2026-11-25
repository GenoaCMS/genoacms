---
title: Documents a consumer receives
---

Three signed documents, and nothing else. A consumer fetches the **key manifest**, a **published page
tree**, and one **component publication** per pinned node — plus, the first time it meets a key, that
key's unsigned **key file**, which the manifest binds.

Every one arrives inside a signed envelope. The shapes below are the *payloads*, after verification.

## The envelope

```ts
interface SignedEnvelope {
  alg: string        // 'SLH-DSA-SHA2-128s' (root) or 'ML-DSA-65' (subordinate)
  keyId: string      // which key signed it
  type: string       // which document this claims to be
  payload: JsonValue
  signature: string  // base64
}
```

The signature is over the RFC 8785 canonical form of `{ alg, keyId, type, payload }` — so `type` is
signed, and a document cannot be presented as a different kind of document than the one that was
signed.

:::caution[A valid signature does not mean a usable document]
A signature attests to **bytes**, not to their shape. Whoever holds the signing key can sign a
malformed payload, so every reader below re-checks the shape after verifying. `readPublication`,
`readPageTree` and `readRegistry` all return `{ ok: false, reason }` for a document that verified and
is still unusable.
:::

## The key manifest

`.genoacms/keys/public.json`, document type `genoacms.keyRegistry.v2`. Verified against the **root
public key** rather than through itself — it is what makes every other key resolvable, so resolving
it through what it defines is what would make the chain never terminate.

```ts
interface KeyRegistry {
  sequence: number          // monotonic; a lower one than you have seen is a rollback
  current: string           // the key signing new documents
  keys: RegistryKey[]
}

interface RegistryKey {
  keyId: string             // the first 16 characters of digest
  alg: 'ML-DSA-65'
  digest: string            // lowercase hex SHA-256 of the raw public key
  createdAt: number
  supersededAt?: number     // rotated away from; its signatures remain valid
  revokedAt?: number        // withdrawn; its signatures are refused
}
```

**Superseded and revoked are different facts.** Refusing a superseded key's signatures would
invalidate every document written before the last rotation. Refusing a revoked key's is the whole
point of revoking it — including for documents it signed *before* revocation, since the reason to
revoke is usually that you no longer know what it signed.

The whole manifest is refused if any one entry is bad, or if it has a member the specification does
not name — keeping the entries that happen to validate would let whoever corrupted one choose which
keys survive. A `genoacms.keyRegistry.v1` registry is not read.

### Key files

`.genoacms/keys/public/{keyId}.json`, unsigned, one per key that is not revoked:

```ts
interface KeyFile {
  keyId: string
  alg: 'ML-DSA-65'
  publicKey: string         // base64
}
```

The verifier fetches a key's file only when a document that key signed is verified, and only after
the manifest lists the key unrevoked. The file is accepted only if the SHA-256 of its key equals the
entry's `digest`, so the file needs no signature of its own. A key file is never rewritten, so it
may be cached without bound; each verifier fetches it at most once.

### Rollback across page loads

A verifier refuses a manifest with a lower `sequence` than one it has loaded. A fresh verifier has
loaded none, so a consumer that can read the instance's secret `GENOACMS_KEY_REGISTRY_SEQUENCE` —
on its own server, say — passes it:

```ts
new Verifier({ rootPublicKey, source, minimumRegistrySequence: 81 })
```

A manifest below it is then refused with `registry-rollback` on the first load too, which is what
stops a restored older manifest from un-revoking a key. The value is a non-negative integer; anything
else throws a `TypeError` from the constructor.

## The published page tree

`.genoacms/pages/readables/{name}`, document type `genoacms.pageTree.v1`.

```ts
interface ReadablePageNode {
  component: string        // the name the page used
  type: 'prebuilt' | 'dynamic'
  uid?: string             // which component
  publicationId?: string   // which release — together these are the pin
  data: Record<string, ReadableAttributeValue>
}

type ReadableAttributeValue =
  | boolean
  | number
  | string
  | string[]
  | ReadablePageNode[]     // a slot: nested components
```

`uid` and `publicationId` are present exactly together — either alone is a pin that cannot be
resolved. Both absent means a component that was never published, which is a node nothing can be
fetched for.

**The tree is signed**, which is not obvious and is the point. Without it, write access to the bucket
would be enough to change which component a page renders without breaking any signature: every
publication stays genuine, and only the document saying *which* to render is swapped.

`type` is stated by the node **and** by the signed publication, in two documents signed at different
times, so they can disagree. A consumer must check them against each other; the SDK does.

Helpers: `readPageTree`, `readNode`, `walkTree`, `pinnedPublications`.

## The component publication

`.genoacms/components/public/{uid}/{publicationId}.json`, document type
`genoacms.componentPublication.v1`. **One object per release**, written once and never rewritten —
which is what lets a consumer cache it forever.

```ts
interface ComponentPublication {
  uid: string
  publicationId: string
  publisherId: string          // who released it — attribution and audit
  publishedAt: number
  note: string
  type: 'prebuilt' | 'dynamic'
  name: string                 // the published name; what a consumer's map is keyed by
  attributes: Record<string, Attribute>   // keyed by attribute uid
  attributeOrder: string[]                // attribute uids, in parameter order
  executables?: PublishedExecutable[]
}

interface PublishedExecutable {
  platform: string             // 'web-esmodule' today
  executableCode: string
  compiledAt: number           // when the server compiled it — not when a person released it
}
```

### The four things a signature does not settle

Checked in this order when the SDK fetches a publication:

1. **Is it shaped like a publication?** Including: a prebuilt component carrying code, or a dynamic
   one carrying none, are both refused rather than reconciled.
2. **Is it the publication the page pinned?** Whoever can write to storage can move a genuine,
   correctly signed *older* release onto the path a newer one occupies, and every signature stays
   valid.
3. **Is it the kind the page said?** See `type` above.
4. **Can this runtime run it?** A release compiled only for other platforms is a correctly signed
   artifact meant for somebody else — refused **after** verifying, because that is what an
   unrecognized platform means.

### Names, order, and the join a consumer has to make

This is the one genuinely awkward corner, and it is worth stating plainly.

- `attributeOrder` is a list of attribute **uids**, in the order the component's parameters take.
- a page node's `data` is keyed by each attribute's **name**.

They are joined through `attributes[uid].schema.title`:

```js
import { attributeNames } from '@genoacms/sdk/verify'

const names = attributeNames(publication)   // ['Heading', 'Body', 'Cards'] in parameter order
const values = names.map(name => node.data[name])
```

`resolvePage` does this for you and hands back `values` already ordered.

The uid exists so an attribute can be **renamed** without breaking stored pages; the name is what a
page's data is keyed by. The CMS refuses to register two attributes with the same name, which is what
makes the name usable as an identity here. `attributeNames` refuses a publication where that has been
violated — a duplicate name, an attribute with no name, or an `attributeOrder` entry naming an
attribute that is not there.

## What each failure reason means

Reasons are machine-readable codes; branch on these rather than on the sentence, which names specific
values and is meant to be read.

| Reason | What happened |
| :--- | :--- |
| `envelope-signature-invalid` | The bytes were edited after signing, or signed by a different key |
| `envelope-wrong-type` | Genuine document, genuinely signed — the wrong kind for what was asked |
| `key-unresolvable` | The signing key is not in the manifest, or is revoked |
| `envelope-algorithm-mismatch` | The envelope names another algorithm than its key was registered for |
| `key-file-absent` | The manifest lists the key, and its key file is not stored |
| `key-file-mismatch` | The key file does not match the manifest's entry for it |
| `registry-rollback` | A manifest older than one already seen, or than `minimumRegistrySequence` |
| `not-an-envelope` | Not envelope-shaped, or names an algorithm the SDK does not have |
| `node-publication-absent` | A node pins a publication that was never written, or was deleted |
| `publication-*` | Verified and malformed — the suffix says which rule |
