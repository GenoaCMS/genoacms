---
title: Signing keys
---

Everything GenoaCMS publishes is signed, so that a consumer reading your bucket can tell your
content from anything else that ends up there. This page is about the keys that do it, and the
screen you manage them from: **Configuration → Signing keys**, governed by `config:keys:manage`.

## Two levels, and only one of them is yours to press

| | signs | rotating it costs |
| :--- | :--- | :--- |
| **Root trust anchor** | the key registry, and nothing else | rebuilding every consumer that embeds it |
| **Subordinate keys** | everything else this instance publishes | nothing |

A consumer embeds the **root public key** and fetches the registry. The registry names the
subordinate keys, and the root's signature on it is what makes them trustworthy. So a subordinate
key can be replaced whenever you like and no consumer notices; the root cannot.

That is why the screen manages subordinate keys and the root is
[`genoacms rotate-root`](/guide/cli), a command run by whoever can also redeploy your consumers.
The screen shows the root public key so you can copy it into a consumer, and offers nothing that
changes it.

## Rotating

**Rotation happens on its own.** `security.subordinateKeyRotationDays` sets the interval — 90 days
by default — and the check runs when a key is about to be used and found overdue. GenoaCMS is not a
daemon, so that is the moment it can be made; a quiet instance will show a key past its interval,
and the next signature rotates it.

The **Rotate** button does the same thing now. Use it after shortening the interval, or when you
want a key of known age before a release.

Rotating is safe and additive:

- a new key is minted and becomes current;
- the outgoing key is marked **superseded** and stays in the registry;
- **everything it signed goes on verifying.**

Nothing needs re-signing, and no consumer needs redeploying.

## Revoking

Revocation is the response to a key that has **leaked**. Rotation is not: a superseded key still
verifies, so an adversary holding its private half can sign a new document that a conforming
consumer accepts. Rotating away from a leaked key achieves nothing at all.

:::caution[Revocation reaches backwards]
A revoked key verifies **nothing**, including signatures it made before you revoked it. There is no
"honour the earlier ones" — nothing dates a signature, and a timestamp inside the document is
attested by the very key under suspicion, so an adversary would simply date their forgery to last
year.
:::

So revoking obliges re-signing whatever that key signed:

- **GenoaCMS's own manifests** are re-signed for you. It holds the content and can simply sign it
  again.
- **Revision-pinned component executables** must be recompiled and re-signed. That is the real cost
  of a compromise, and it is reported rather than hidden.

If the key you revoke is the current one, a new key is minted first — the instance always keeps a
live key to sign the registry that records the revocation.

## What the screen shows

- **Root trust anchor** — the key id and the full public key, which is what a consumer SDK embeds.
- **Registry** — the publication **sequence**, and when the current key falls due. The sequence
  increments on every publication and is how a restored older registry is detected: without it,
  putting back yesterday's copy would undo a revocation with a signature that still verifies.
- **Subordinate keys** — every key with its state:

| state | means | verification |
| :--- | :--- | :--- |
| `current` | new signatures use this key | accepted |
| `superseded` | retired from signing, not distrusted | **accepted** |
| `revoked` | not trusted | **rejected outright** |

## Permissions

One permission covers the whole screen, reading included. There is no separate read permission
because the registry is **published** — every consumer fetches it in order to verify anything — so
there would be nothing to withhold. What the screen adds is the ability to act.

See [roles and permissions](/guide/authorization) for granting it.
