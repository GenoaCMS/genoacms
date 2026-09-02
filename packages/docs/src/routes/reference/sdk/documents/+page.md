---
title: Documents a consumer receives
---

Three signed documents, and nothing else. A consumer fetches the **key registry**, a **published page
tree**, and one **component publication** per pinned node.

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

## The key registry

`.genoacms/keys/public.json`, document type `genoacms.keyRegistry.v1`. Verified against the **root
public key** rather than through itself — it is what makes every other key resolvable, so resolving
it through what it defines is what would make the chain never terminate.

```ts
interface KeyRegistry {
  sequence: number          // monotonic; a lower one than you have seen is a rollback
  current: string           // the key signing new documents
  keys: RegistryKey[]
}

interface RegistryKey {
  keyId: string             // derived from the public key, and re-derived on read
  alg: string
  publicKey: string         // base64
  createdAt: number
  supersededAt?: number     // rotated away from; its signatures remain valid
  revokedAt?: number        // withdrawn; its signatures are refused
}
```

**Superseded and revoked are different facts.** Refusing a superseded key's signatures would
invalidate every document written before the last rotation. Refusing a revoked key's is the whole
point of revoking it — including for documents it signed *before* revocation, since the reason to
revoke is usually that you no longer know what it signed.

`keyId` is re-derived from `publicKey` on read. That is what stops a tampered registry publishing an
attacker's key under an id your documents already name.

The whole registry is refused if any one entry is bad — keeping the entries that happen to validate
would let whoever corrupted one choose which keys survive.

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
| `key-unresolvable` | The signing key is not in the registry, or is revoked |
| `registry-rollback` | An older registry than one already seen |
| `not-an-envelope` | Not envelope-shaped, or names an algorithm the SDK does not have |
| `node-publication-absent` | A node pins a publication that was never written, or was deleted |
| `publication-*` | Verified and malformed — the suffix says which rule |
